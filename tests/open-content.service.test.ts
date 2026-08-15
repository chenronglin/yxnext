import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/server/shared/api-response"
import type { OpenContentAuditContext, OpenContentPrincipal } from "@/types/open-content"

const { mockTx, mockPrisma } = vi.hoisted(() => {
  const tx = {
    doc: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    project: {
      findUnique: vi.fn(),
    },
    operationLog: {
      create: vi.fn(),
    },
  }

  return {
    mockTx: tx,
    mockPrisma: {
      $transaction: vi.fn(),
    },
  }
})

vi.mock("@/server/db/prisma", () => ({
  prisma: mockPrisma,
}))

import { getOpenDocContent, listOpenProjectContent } from "@/server/modules/open/open-content.service"

const principal: OpenContentPrincipal = {
  caller: "agent-content-reader",
  allowedProjectIds: null,
}

const audit: OpenContentAuditContext = {
  caller: "agent-content-reader",
  requestId: "request-001",
  ipAddress: "203.0.113.10",
  userAgent: "content-client/1.0",
}

function makeDoc(
  overrides: Partial<{
    docId: bigint
    projectId: bigint
    docType: "synopsis" | "outline" | "chapter" | "release"
    stageCode: "synopsis" | "outline" | "chapter" | "release"
    title: string
    chapterNo: number | null
    sortOrder: number
    status: "draft" | "submitted" | "rejected" | "approved"
    isDeleted: boolean
    activeDraft: null | {
      status: "active" | "sealed" | "archived"
      wordCount: number
      plainText: string | null
      cleanText: string | null
      exportText: string | null
      updatedAt: Date
    }
    finalRevision: null | {
      wordCount: number
      plainText: string | null
      cleanText: string | null
      exportText: string | null
      createdAt: Date
    }
  }> = {},
) {
  return {
    docId: 101n,
    projectId: 10n,
    docType: "chapter" as const,
    stageCode: "chapter" as const,
    title: "第一章",
    chapterNo: 1,
    sortOrder: 1,
    status: "draft" as const,
    isDeleted: false,
    activeDraft: {
      status: "active" as const,
      wordCount: 1200,
      plainText: "草稿纯文本",
      cleanText: "草稿清洁文本",
      exportText: "草稿导出文本",
      updatedAt: new Date("2026-08-15T08:00:00.000Z"),
    },
    finalRevision: null,
    ...overrides,
  }
}

describe("Open Content 查询服务", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 用回调式事务模拟“读取正文成功必须同时写入调用审计”的原子边界。
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: typeof mockTx) => unknown) => callback(mockTx))
    mockTx.operationLog.create.mockResolvedValue({})
    mockTx.project.findUnique.mockResolvedValue({ projectId: 10n })
    mockTx.doc.findFirst.mockResolvedValue({ docId: 101n, projectId: 10n })
  })

  it("单 Doc 优先返回活跃草稿的清洁文本，并记录不含正文的审计信息", async () => {
    mockTx.doc.findUnique.mockResolvedValue(
      makeDoc({
        finalRevision: {
          wordCount: 1000,
          plainText: "定稿纯文本",
          cleanText: "定稿清洁文本",
          exportText: "定稿导出文本",
          createdAt: new Date("2026-08-14T08:00:00.000Z"),
        },
      }),
    )

    const result = await getOpenDocContent({ docId: 101n, principal, audit })

    expect(result).toEqual({
      docId: "101",
      projectId: "10",
      stage: "chapter",
      title: "第一章",
      order: 1,
      wordCount: 1200,
      updatedAt: "2026-08-15T08:00:00.000Z",
      content: "草稿清洁文本",
    })
    expect(mockTx.operationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorRole: "open_content_api",
        action: "open.content.read",
        entityType: "doc",
        entityId: 101n,
        projectId: 10n,
        docId: 101n,
        requestId: "request-001",
        metadataJson: {
          caller: "agent-content-reader",
          mode: "single",
          stage: "chapter",
          requestedDocIds: ["101"],
        },
      }),
    })
    const serializedAuditCall = JSON.stringify(mockTx.operationLog.create.mock.calls[0], (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    )
    expect(serializedAuditCall).not.toContain("草稿清洁文本")
  })

  it("已通过且没有活跃草稿时回退到 finalRevision，并按文本优先级回退", async () => {
    mockTx.doc.findUnique.mockResolvedValue(
      makeDoc({
        docType: "outline",
        stageCode: "outline",
        title: "项目细纲",
        chapterNo: null,
        sortOrder: 0,
        status: "approved",
        activeDraft: null,
        finalRevision: {
          wordCount: 800,
          plainText: "定稿纯文本",
          cleanText: null,
          exportText: "定稿导出文本",
          createdAt: new Date("2026-08-14T08:00:00.000Z"),
        },
      }),
    )

    const result = await getOpenDocContent({ docId: 101n, principal, audit })

    expect(result).toMatchObject({
      stage: "outline",
      order: null,
      wordCount: 800,
      updatedAt: "2026-08-14T08:00:00.000Z",
      content: "定稿导出文本",
    })
  })

  it("拒绝质检 Doc、已删除 Doc 和没有可读快照的 Doc，且不会写入成功审计", async () => {
    mockTx.doc.findUnique.mockResolvedValueOnce(
      makeDoc({ docType: "release", stageCode: "release", title: "质检稿" }),
    )
    await expect(getOpenDocContent({ docId: 101n, principal, audit })).rejects.toMatchObject({
      status: 400,
      code: "OPEN_CONTENT_DOC_TYPE_UNSUPPORTED",
    })

    mockTx.doc.findFirst.mockResolvedValueOnce(null)
    await expect(getOpenDocContent({ docId: 102n, principal, audit })).rejects.toMatchObject({
      status: 404,
      code: "OPEN_CONTENT_DOC_NOT_FOUND",
    })

    mockTx.doc.findUnique.mockResolvedValueOnce(makeDoc({ activeDraft: null }))
    await expect(getOpenDocContent({ docId: 103n, principal, audit })).rejects.toBeInstanceOf(ApiError)
    expect(mockTx.operationLog.create).not.toHaveBeenCalled()
  })

  it("项目批量读取支持章序范围、对外章序排序，并只审计实际返回的 Doc", async () => {
    mockTx.doc.findMany.mockResolvedValue([
      makeDoc({ docId: 103n, title: "第三章", chapterNo: 3, sortOrder: 3 }),
      makeDoc({ docId: 102n, title: "第二章", chapterNo: null, sortOrder: 2 }),
      makeDoc({ docId: 101n, title: "第一章", chapterNo: 1, sortOrder: 10 }),
    ])

    const result = await listOpenProjectContent({
      projectId: 10n,
      stage: "chapter",
      orderRange: { start: 1, end: 2 },
      page: 1,
      pageSize: null,
      principal,
      audit,
    })

    expect(result).toMatchObject({
      items: [
        { docId: "101", order: 1 },
        { docId: "102", order: 2 },
      ],
      page: 1,
      pageSize: 2,
      total: 2,
      totalPages: 1,
    })
    expect(mockTx.operationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: "project",
        entityId: 10n,
        projectId: 10n,
        docId: undefined,
        metadataJson: {
          caller: "agent-content-reader",
          mode: "batch",
          stage: "chapter",
          requestedDocIds: ["101", "102"],
          orderStart: 1,
          orderEnd: 2,
          page: 1,
          pageSize: 2,
        },
      }),
    })
  })

  it("项目批量读取沿用分页外壳，审计只记录当前页 Doc", async () => {
    mockTx.doc.findMany.mockResolvedValue([
      makeDoc({ docId: 101n, title: "第一章", chapterNo: 1 }),
      makeDoc({ docId: 102n, title: "第二章", chapterNo: 2, sortOrder: 2 }),
      makeDoc({ docId: 103n, title: "第三章", chapterNo: 3, sortOrder: 3 }),
    ])

    const result = await listOpenProjectContent({
      projectId: 10n,
      stage: "chapter",
      orderRange: null,
      page: 2,
      pageSize: 1,
      principal,
      audit,
    })

    expect(result).toMatchObject({
      items: [{ docId: "102", order: 2 }],
      page: 2,
      pageSize: 1,
      total: 3,
      totalPages: 3,
    })
    expect(mockTx.doc.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          docId: { in: [102n] },
        }),
      }),
    )
    expect(mockTx.operationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadataJson: expect.objectContaining({ requestedDocIds: ["102"], page: 2, pageSize: 1 }),
      }),
    })
  })

  it("项目白名单拒绝时不查询正文，项目不存在时返回 404", async () => {
    const restrictedPrincipal = { ...principal, allowedProjectIds: new Set(["20"]) }
    await expect(
      getOpenDocContent({
        docId: 101n,
        principal: restrictedPrincipal,
        audit,
      }),
    ).rejects.toMatchObject({ status: 403, code: "OPEN_CONTENT_PROJECT_FORBIDDEN" })
    expect(mockTx.doc.findUnique).not.toHaveBeenCalled()

    await expect(
      listOpenProjectContent({
        projectId: 10n,
        stage: "synopsis",
        orderRange: null,
        page: 1,
        pageSize: null,
        principal: restrictedPrincipal,
        audit,
      }),
    ).rejects.toMatchObject({ status: 403, code: "OPEN_CONTENT_PROJECT_FORBIDDEN" })
    expect(mockTx.doc.findMany).not.toHaveBeenCalled()

    mockTx.project.findUnique.mockResolvedValueOnce(null)
    await expect(
      listOpenProjectContent({
        projectId: 99n,
        stage: "synopsis",
        orderRange: null,
        page: 1,
        pageSize: null,
        principal,
        audit,
      }),
    ).rejects.toMatchObject({ status: 404, code: "OPEN_CONTENT_PROJECT_NOT_FOUND" })
  })
})
