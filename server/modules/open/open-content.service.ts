import "server-only"

import { Prisma } from "@prisma/client"

import { prisma } from "@/server/db/prisma"
import { assertOpenContentProjectAccess } from "@/server/auth/open-api-token"
import { ApiError } from "@/server/shared/api-response"
import type {
  OpenContentAuditContext,
  OpenContentItem,
  OpenContentPrincipal,
  OpenProjectContentInput,
  OpenProjectContentResult,
} from "@/types/open-content"

// 正文读取只选择纯文本投影和确定内容版本所需字段，不把富文本 JSON、批注或修订详情带出系统。
const openContentDocSelect = {
  docId: true,
  projectId: true,
  docType: true,
  stageCode: true,
  title: true,
  chapterNo: true,
  sortOrder: true,
  status: true,
  isDeleted: true,
  activeDraft: {
    select: {
      status: true,
      wordCount: true,
      plainText: true,
      cleanText: true,
      exportText: true,
      updatedAt: true,
    },
  },
  finalRevision: {
    select: {
      wordCount: true,
      plainText: true,
      cleanText: true,
      exportText: true,
      createdAt: true,
    },
  },
} satisfies Prisma.DocSelect

type OpenContentDocRecord = Prisma.DocGetPayload<{ select: typeof openContentDocSelect }>

// 批量接口先只查询排序和分页所需的轻量字段，确认当前页后才加载对应正文，避免分页请求扫描全部大文本。
const openContentDocOrderSelect = {
  docId: true,
  chapterNo: true,
  sortOrder: true,
} satisfies Prisma.DocSelect

type OpenContentDocOrderRecord = Prisma.DocGetPayload<{ select: typeof openContentDocOrderSelect }>

function contentSource(doc: OpenContentDocRecord) {
  // 与系统现有 Doc 当前视图保持一致：有活跃草稿时读取草稿；已通过且无草稿时读取最终 Revision。
  if (doc.activeDraft?.status === "active") {
    return {
      wordCount: doc.activeDraft.wordCount,
      cleanText: doc.activeDraft.cleanText,
      exportText: doc.activeDraft.exportText,
      plainText: doc.activeDraft.plainText,
      updatedAt: doc.activeDraft.updatedAt,
    }
  }

  if (doc.status === "approved" && doc.finalRevision) {
    return {
      wordCount: doc.finalRevision.wordCount,
      cleanText: doc.finalRevision.cleanText,
      exportText: doc.finalRevision.exportText,
      plainText: doc.finalRevision.plainText,
      updatedAt: doc.finalRevision.createdAt,
    }
  }

  throw new ApiError({
    status: 409,
    code: "OPEN_CONTENT_SOURCE_MISSING",
    message: "当前 Doc 缺少可读取的内容版本",
  })
}

function toContentItem(doc: OpenContentDocRecord): OpenContentItem {
  if (doc.docType === "release" || doc.stageCode === "release") {
    throw new ApiError({
      status: 400,
      code: "OPEN_CONTENT_DOC_TYPE_UNSUPPORTED",
      message: "正文 Open API 不支持质检 Doc",
    })
  }

  const source = contentSource(doc)

  return {
    docId: doc.docId.toString(),
    projectId: doc.projectId.toString(),
    stage: doc.stageCode,
    title: doc.title,
    // 梗概和细纲没有章序；正文章节与 projects.chapters[].order 保持 chapterNo 优先、sortOrder 回退。
    order: doc.docType === "chapter" ? (doc.chapterNo ?? doc.sortOrder) : null,
    wordCount: source.wordCount,
    updatedAt: source.updatedAt.toISOString(),
    // cleanText 已去除协作修订中的删除/原始标记，是正文外发的首选纯文本；旧数据再依次回退。
    content: source.cleanText ?? source.exportText ?? source.plainText ?? "",
  }
}

function effectiveDocOrder(doc: Pick<OpenContentDocOrderRecord, "chapterNo" | "sortOrder">) {
  return doc.chapterNo ?? doc.sortOrder
}

function compareDocOrder(left: OpenContentDocOrderRecord, right: OpenContentDocOrderRecord) {
  const orderDifference = effectiveDocOrder(left) - effectiveDocOrder(right)
  if (orderDifference !== 0) return orderDifference
  return left.docId < right.docId ? -1 : left.docId > right.docId ? 1 : 0
}

function writeContentReadAudit(
  tx: Prisma.TransactionClient,
  input: {
    projectId: bigint
    docId?: bigint
    entityType: "doc" | "project"
    entityId: bigint
    stage: "synopsis" | "outline" | "chapter"
    docIds: string[]
    mode: "single" | "batch"
    audit: OpenContentAuditContext
    orderRange?: { start: number; end: number } | null
    page?: number
    pageSize?: number
  },
) {
  // 审计只保存调用方、范围和 Doc ID，不复制正文内容，避免日志成为第二份核心 IP 存储。
  return tx.operationLog.create({
    data: {
      actorUserId: null,
      actorRole: "open_content_api",
      action: "open.content.read",
      entityType: input.entityType,
      entityId: input.entityId,
      projectId: input.projectId,
      docId: input.docId,
      requestId: input.audit.requestId,
      ipAddress: input.audit.ipAddress,
      userAgent: input.audit.userAgent,
      metadataJson: {
        caller: input.audit.caller,
        mode: input.mode,
        stage: input.stage,
        requestedDocIds: input.docIds,
        ...(input.orderRange
          ? {
              orderStart: input.orderRange.start,
              orderEnd: input.orderRange.end,
            }
          : {}),
        ...(input.page ? { page: input.page } : {}),
        ...(input.pageSize ? { pageSize: input.pageSize } : {}),
      },
    },
  })
}

export async function getOpenDocContent(input: {
  docId: bigint
  principal: OpenContentPrincipal
  audit: OpenContentAuditContext
}): Promise<OpenContentItem> {
  // 内容查询和审计写入使用同一事务；审计失败时不返回正文，确保所有成功读取都有留痕。
  return prisma.$transaction(async (tx) => {
    // 单 Doc 路径先只读取归属项目，项目白名单通过后才加载正文，避免越权请求把核心内容读入应用内存。
    const identity = await tx.doc.findFirst({
      where: {
        docId: input.docId,
        isDeleted: false,
      },
      select: {
        docId: true,
        projectId: true,
      },
    })

    if (!identity) {
      throw new ApiError({
        status: 404,
        code: "OPEN_CONTENT_DOC_NOT_FOUND",
        message: "Doc 不存在",
      })
    }

    assertOpenContentProjectAccess(input.principal, identity.projectId)

    const doc = await tx.doc.findUnique({
      where: {
        docId: identity.docId,
        isDeleted: false,
      },
      select: openContentDocSelect,
    })

    if (!doc) {
      throw new ApiError({
        status: 404,
        code: "OPEN_CONTENT_DOC_NOT_FOUND",
        message: "Doc 不存在",
      })
    }

    const item = toContentItem(doc)

    await writeContentReadAudit(tx, {
      projectId: doc.projectId,
      docId: doc.docId,
      entityType: "doc",
      entityId: doc.docId,
      stage: item.stage,
      docIds: [item.docId],
      mode: "single",
      audit: input.audit,
    })

    return item
  })
}

export async function listOpenProjectContent(input: OpenProjectContentInput): Promise<OpenProjectContentResult> {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: {
        projectId: input.projectId,
      },
      select: {
        projectId: true,
      },
    })

    if (!project) {
      throw new ApiError({
        status: 404,
        code: "OPEN_CONTENT_PROJECT_NOT_FOUND",
        message: "项目不存在",
      })
    }

    // 在读取任何正文前执行项目白名单检查，避免未授权 Token 通过响应差异探测项目内容。
    assertOpenContentProjectAccess(input.principal, project.projectId)

    const docOrderRecords = await tx.doc.findMany({
      where: {
        projectId: project.projectId,
        stageCode: input.stage,
        docType: input.stage,
        isDeleted: false,
      },
      select: openContentDocOrderSelect,
      orderBy: [{ sortOrder: "asc" }, { chapterNo: "asc" }, { docId: "asc" }],
    })
    const selectedDocOrderRecords = docOrderRecords
      // 先按轻量元数据缩小章序范围；范围外的空白章节不应阻断本次按需读取。
      .filter((doc) => {
        if (!input.orderRange) return true
        const order = effectiveDocOrder(doc)
        return order >= input.orderRange.start && order <= input.orderRange.end
      })
      // order 是对外契约中的章序，不能依赖数据库查询使用的内部 sortOrder 顺序。
      .sort(compareDocOrder)

    const total = selectedDocOrderRecords.length
    const effectivePageSize = input.pageSize ?? Math.max(total, 1)
    const totalPages = Math.max(1, Math.ceil(total / effectivePageSize))
    const start = input.pageSize ? (input.page - 1) * effectivePageSize : 0
    const pageDocOrderRecords = input.pageSize
      ? selectedDocOrderRecords.slice(start, start + effectivePageSize)
      : selectedDocOrderRecords
    const pageDocIds = pageDocOrderRecords.map((doc) => doc.docId)

    const pageDocs = pageDocIds.length
      ? await tx.doc.findMany({
          where: {
            docId: { in: pageDocIds },
            projectId: project.projectId,
            stageCode: input.stage,
            docType: input.stage,
            isDeleted: false,
          },
          select: openContentDocSelect,
        })
      : []
    const pageDocMap = new Map(pageDocs.map((doc) => [doc.docId.toString(), doc]))
    const items = pageDocOrderRecords.map((docOrderRecord) => {
      const doc = pageDocMap.get(docOrderRecord.docId.toString())
      if (!doc) {
        // 两次查询位于同一事务快照，正常情况下不会缺失；显式失败可防止分页元数据与正文列表静默错位。
        throw new Error(`Open Content 分页 Doc ${docOrderRecord.docId.toString()} 缺失`)
      }
      return toContentItem(doc)
    })

    await writeContentReadAudit(tx, {
      projectId: project.projectId,
      entityType: "project",
      entityId: project.projectId,
      stage: input.stage,
      docIds: items.map((item) => item.docId),
      mode: "batch",
      audit: input.audit,
      orderRange: input.orderRange,
      page: input.page,
      pageSize: effectivePageSize,
    })

    return {
      items,
      page: input.page,
      pageSize: effectivePageSize,
      total,
      totalPages,
    }
  })
}
