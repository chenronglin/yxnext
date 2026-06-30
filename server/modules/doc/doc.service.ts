import "server-only"

import { createHash } from "crypto"

import { Prisma } from "@prisma/client"

import { prisma } from "@/server/db/prisma"
import { ApiError } from "@/server/shared/api-response"
import {
  makeActiveDocKey,
  makeSingleDocKey,
  translateUniqueConstraintError,
} from "@/server/shared/invariant-keys"
import { createNovelDocV1, deriveNovelDocProjection, isNovelDocV1 } from "@/lib/novel-doc"
import type { ApiCurrentUser } from "@/server/shared/current-user"
import type {
  DocCurrentView,
  DocMeta,
  DocPermissions,
  DocProjectSummary,
  DocRevisionDetail,
  DocRevisionListItem,
  DocRevisionListResponse,
} from "@/types/doc"

type TxClient = Prisma.TransactionClient

type SaveDocInput = {
  lockVersion: number
  contentJson: Record<string, unknown>
  wordCount: number
  plainText: string
  cleanText?: string | null
  exportText?: string | null
  summary?: string | null
  contentSchemaVersion?: number
  commentCount?: number
  suggestionCount?: number
  revisionMarkCount?: number
}

type SubmitDocInput = {
  lockVersion: number
  submitNote?: string | null
}

type ReturnDocInput = {
  lockVersion: number
  returnNote: string
}

type ApproveDocInput = {
  lockVersion: number
  approveNote?: string | null
}

type OperationLogInput = {
  actor: ApiCurrentUser
  action: string
  entityType: "doc"
  entityId: bigint
  projectId: bigint
  docId: bigint
  beforeJson?: Prisma.InputJsonValue
  afterJson?: Prisma.InputJsonValue
  metadataJson?: Prisma.InputJsonValue
}

// 统一维护阶段顺序，避免流程推进时散落硬编码。
const STAGE_ORDER = ["synopsis", "outline", "chapter", "release"] as const

// 新建空白稿件时沿用当前项目的文档 schema 版本；v1 先固定为 1。
const DEFAULT_CONTENT_SCHEMA_VERSION = 1

const userSummarySelect = {
  userId: true,
  username: true,
  displayName: true,
} satisfies Prisma.UserSelect

const stagePlanSelect = {
  stagePlanId: true,
  stageCode: true,
  gateStatus: true,
  timelineStatus: true,
  planDays: true,
  unlockedAt: true,
  startedAt: true,
  dueAt: true,
  completedAt: true,
} satisfies Prisma.ProjectStagePlanSelect

const activeDraftSelect = {
  draftId: true,
  docId: true,
  ownerRole: true,
  ownerUserId: true,
  baseRevisionId: true,
  contentSchemaVersion: true,
  contentJson: true,
  wordCount: true,
  plainText: true,
  cleanText: true,
  exportText: true,
  summary: true,
  commentCount: true,
  suggestionCount: true,
  revisionMarkCount: true,
  status: true,
  lockVersion: true,
  saveCount: true,
  createdAt: true,
  updatedAt: true,
  sealedAt: true,
} satisfies Prisma.DocCurrentDraftSelect

const revisionSelect = {
  revisionId: true,
  docId: true,
  revisionNo: true,
  baseRevisionId: true,
  fromDraftId: true,
  contentSchemaVersion: true,
  contentJson: true,
  wordCount: true,
  plainText: true,
  cleanText: true,
  exportText: true,
  summary: true,
  commentCount: true,
  suggestionCount: true,
  revisionMarkCount: true,
  action: true,
  actorRole: true,
  actorUserId: true,
  handoffNote: true,
  contentHash: true,
  createdAt: true,
  actor: {
    select: userSummarySelect,
  },
  baseRevision: {
    select: {
      revisionId: true,
      revisionNo: true,
    },
  },
} satisfies Prisma.DocRevisionSelect

const workflowDocInclude = {
  project: {
    include: {
      editor: {
        select: userSummarySelect,
      },
      author: {
        select: userSummarySelect,
      },
      stagePlans: {
        select: stagePlanSelect,
      },
    },
  },
  activeDraft: {
    select: activeDraftSelect,
  },
  finalRevision: {
    select: revisionSelect,
  },
  latestRevision: {
    select: revisionSelect,
  },
  lastActor: {
    select: userSummarySelect,
  },
} satisfies Prisma.DocInclude

type WorkflowDocRecord = Prisma.DocGetPayload<{ include: typeof workflowDocInclude }>

type RevisionRecord = Prisma.DocRevisionGetPayload<{ select: typeof revisionSelect }>

function trimToNull(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function parseBigIntId(value: string | number | bigint, label: string) {
  const raw = String(value)

  if (!/^\d+$/.test(raw)) {
    throw new ApiError({
      status: 400,
      code: "INVALID_ID",
      message: `${label} 必须是数字 ID`,
    })
  }

  return BigInt(raw)
}

function toIsoString(value: Date | null | undefined) {
  return value ? value.toISOString() : null
}

function userName(user: { username: string; displayName: string | null }) {
  return user.displayName ?? user.username
}

function addDays(base: Date, days: number) {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000)
}

function hashJson(value: Prisma.InputJsonValue) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}

function asInputJson(value: Prisma.JsonValue): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}

function dbDocStatusToApiStatus(status: WorkflowDocRecord["status"]): DocMeta["status"] {
  return status === "rejected" ? "returned" : status
}

function dbDocActionToApiAction(action: WorkflowDocRecord["lastAction"]): DocMeta["lastAction"] {
  if (!action) return null
  return action === "editor_reject" ? "editor_return" : action
}

function dbRevisionActionToApiAction(action: RevisionRecord["action"]): DocRevisionListItem["action"] {
  return action === "editor_reject" ? "editor_return" : action
}

function mapStagePlan(
  plan: WorkflowDocRecord["project"]["stagePlans"][number] | null | undefined,
): DocProjectSummary["docStagePlan"] {
  if (!plan) {
    return null
  }

  return {
    stageCode: plan.stageCode,
    gateStatus: plan.gateStatus,
    timelineStatus: plan.timelineStatus,
    planDays: plan.planDays,
    unlockedAt: toIsoString(plan.unlockedAt),
    startedAt: toIsoString(plan.startedAt),
    dueAt: toIsoString(plan.dueAt),
    completedAt: toIsoString(plan.completedAt),
  }
}

function findStagePlan(
  doc: Pick<WorkflowDocRecord, "stageCode" | "project">,
  stageCode: (typeof STAGE_ORDER)[number] = doc.stageCode,
) {
  return doc.project.stagePlans.find((item) => item.stageCode === stageCode) ?? null
}

function makeDocVisibilityWhere(actor: ApiCurrentUser, docId: bigint): Prisma.DocWhereInput {
  if (actor.role === "admin") {
    return {
      docId,
      isDeleted: false,
    }
  }

  if (actor.role === "editor") {
    return {
      docId,
      isDeleted: false,
      project: {
        editorId: actor.userId,
      },
    }
  }

  return {
    docId,
    isDeleted: false,
    project: {
      authorId: actor.userId,
    },
  }
}

async function findVisibleDocOrThrow(
  client: Pick<TxClient, "doc"> | typeof prisma,
  actor: ApiCurrentUser,
  docId: bigint,
) {
  const doc = await client.doc.findFirst({
    where: makeDocVisibilityWhere(actor, docId),
    include: workflowDocInclude,
  })

  if (!doc) {
    throw new ApiError({
      status: 404,
      code: "DOC_NOT_FOUND",
      message: "Doc 不存在或无权访问",
    })
  }

  return doc
}

function assertProjectWritable(doc: WorkflowDocRecord) {
  if (doc.project.lifecycleStatus !== "active") {
    throw new ApiError({
      status: 409,
      code: "PROJECT_READ_ONLY",
      message: "当前项目不是进行中状态，Doc 只读",
    })
  }
}

function assertDocStagePlanExists(doc: WorkflowDocRecord) {
  const stagePlan = findStagePlan(doc)

  if (!stagePlan) {
    throw new ApiError({
      status: 409,
      code: "DOC_STAGE_PLAN_MISSING",
      message: "Doc 所属阶段计划不存在，无法继续操作",
    })
  }

  return stagePlan
}

function assertActiveDraft(doc: WorkflowDocRecord) {
  if (!doc.activeDraft || doc.activeDraft.status !== "active") {
    throw new ApiError({
      status: 409,
      code: "DOC_ACTIVE_DRAFT_MISSING",
      message: "当前 Doc 没有可编辑的活跃草稿",
    })
  }

  return doc.activeDraft
}

function assertEditableByOwner(doc: WorkflowDocRecord, actor: ApiCurrentUser) {
  const activeDraft = assertActiveDraft(doc)

  if (doc.holderRole === "none" || actor.role === "admin") {
    throw new ApiError({
      status: 403,
      code: "DOC_NOT_HOLDER",
      message: "只有当前持有人本人可以编辑或保存正文",
    })
  }

  if (activeDraft.ownerUserId !== actor.userId || activeDraft.ownerRole !== actor.role || doc.holderRole !== actor.role) {
    throw new ApiError({
      status: 403,
      code: "DOC_NOT_HOLDER",
      message: "只有当前持有人本人可以编辑或保存正文",
    })
  }

  return activeDraft
}

function assertReviewer(actor: ApiCurrentUser, doc: WorkflowDocRecord) {
  if (actor.role === "admin") {
    return
  }

  if (actor.role !== "editor" || actor.userId !== doc.project.editorId) {
    throw new ApiError({
      status: 403,
      code: "DOC_REVIEW_FORBIDDEN",
      message: "只有项目编辑或管理员可以审核该 Doc",
    })
  }
}

function assertReviewableState(doc: WorkflowDocRecord) {
  const activeDraft = assertActiveDraft(doc)

  if (doc.status !== "submitted" || doc.holderRole !== "editor") {
    throw new ApiError({
      status: 409,
      code: "DOC_NOT_SUBMITTED",
      message: "当前 Doc 不处于待审核状态",
    })
  }

  if (activeDraft.ownerRole !== "editor" || activeDraft.ownerUserId !== doc.project.editorId) {
    throw new ApiError({
      status: 409,
      code: "DOC_REVIEW_STATE_INVALID",
      message: "当前待审核稿件的持有人状态异常",
    })
  }

  return activeDraft
}

function assertSaveGate(doc: WorkflowDocRecord) {
  // 全文质检未解锁前完全禁止保存；其它阶段即使 gate 仍是 locked，也允许作者先写草稿。
  if (doc.stageCode === "release" && doc.project.releaseStatus === "locked") {
    throw new ApiError({
      status: 409,
      code: "DOC_RELEASE_LOCKED",
      message: "全文质检尚未解锁，不能保存或提交",
    })
  }
}

function assertSubmitGate(doc: WorkflowDocRecord) {
  const stagePlan = assertDocStagePlanExists(doc)

  if (doc.stageCode === "release") {
    if (doc.project.releaseStatus === "locked") {
      throw new ApiError({
        status: 409,
        code: "DOC_RELEASE_LOCKED",
        message: "全文质检尚未解锁，不能保存或提交",
      })
    }

    return
  }

  if (stagePlan.gateStatus === "locked") {
    throw new ApiError({
      status: 409,
      code: "DOC_STAGE_LOCKED",
      message: "当前阶段尚未解锁，草稿可以保存但不能提交审核",
    })
  }
}

function normalizeSavePayload(input: SaveDocInput) {
  if (input.contentSchemaVersion !== undefined && input.contentSchemaVersion !== DEFAULT_CONTENT_SCHEMA_VERSION) {
    throw new ApiError({
      status: 400,
      code: "DOC_CONTENT_SCHEMA_UNSUPPORTED",
      message: "当前保存接口只支持 Novel Editor Tiptap JSON v1",
    })
  }

  if (!isNovelDocV1(input.contentJson)) {
    throw new ApiError({
      status: 400,
      code: "DOC_CONTENT_SCHEMA_UNSUPPORTED",
      message: "contentJson 必须是 Novel Editor Tiptap JSON v1",
    })
  }

  const projection = deriveNovelDocProjection(input.contentJson)

  return {
    contentSchemaVersion: DEFAULT_CONTENT_SCHEMA_VERSION,
    // 保存接口不再信任前端投影；前端只提交编辑器 JSON，服务端统一重导文本和计数。
    contentJson: projection.contentJson as unknown as Prisma.InputJsonObject,
    wordCount: projection.wordCount,
    plainText: projection.plainText,
    cleanText: projection.cleanText,
    exportText: projection.exportText,
    summary: projection.summary,
    commentCount: projection.commentCount,
    suggestionCount: projection.suggestionCount,
    revisionMarkCount: projection.revisionMarkCount,
  }
}

function assertCleanTextConsistency(input: {
  plainText: string
  cleanText: string | null
  commentCount: number
  suggestionCount: number
  revisionMarkCount: number
}) {
  const plainText = input.plainText.trim()
  const cleanText = input.cleanText?.trim() ?? ""
  const hasCollaborationMarks = input.commentCount > 0 || input.suggestionCount > 0 || input.revisionMarkCount > 0

  // Clean 正文是“移除协作标记后的正文视图”，不是把 plainText 原样再传一份。
  // 当稿件里已经存在批注、建议或修订标记时，前端必须显式提交清洗后的正文结果。
  if (hasCollaborationMarks && plainText && !cleanText) {
    throw new ApiError({
      status: 400,
      code: "DOC_CLEAN_TEXT_REQUIRED",
      message: "当前稿件包含协作标记，提交时必须同时提供 Clean 正文",
    })
  }

}

function toDocMeta(doc: WorkflowDocRecord): DocMeta {
  return {
    docId: doc.docId.toString(),
    projectId: doc.projectId.toString(),
    docType: doc.docType,
    stageCode: doc.stageCode,
    title: doc.title,
    chapterNo: doc.chapterNo,
    sortOrder: doc.sortOrder,
    status: dbDocStatusToApiStatus(doc.status),
    holderRole: doc.holderRole,
    activeDraftId: doc.activeDraftId?.toString() ?? null,
    latestRevisionId: doc.latestRevisionId?.toString() ?? null,
    finalRevisionId: doc.finalRevisionId?.toString() ?? null,
    currentWordCount: doc.currentWordCount,
    currentPlainText: doc.currentPlainText,
    currentCleanText: doc.currentCleanText,
    summary: doc.summary,
    lastAction: dbDocActionToApiAction(doc.lastAction),
    lastActorId: doc.lastActorId?.toString() ?? null,
    lastActorName: doc.lastActor ? userName(doc.lastActor) : null,
    lastActionAt: toIsoString(doc.lastActionAt),
    lastHandoffNote: doc.lastHandoffNote,
    submittedAt: toIsoString(doc.submittedAt),
    reviewedAt: toIsoString(doc.reviewedAt),
    approvedAt: toIsoString(doc.approvedAt),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  }
}

function toProjectSummary(doc: WorkflowDocRecord): DocProjectSummary {
  return {
    projectId: doc.project.projectId.toString(),
    title: doc.project.title,
    editorId: doc.project.editorId.toString(),
    editorName: userName(doc.project.editor),
    authorId: doc.project.authorId.toString(),
    authorName: userName(doc.project.author),
    lifecycleStatus: doc.project.lifecycleStatus,
    currentStage: doc.project.currentStage,
    releaseStatus: doc.project.releaseStatus,
    docStagePlan: mapStagePlan(findStagePlan(doc)),
  }
}

function toPermissions(actor: ApiCurrentUser, doc: WorkflowDocRecord): DocPermissions {
  const projectWritable = doc.project.lifecycleStatus === "active"
  const activeDraft = doc.activeDraft && doc.activeDraft.status === "active" ? doc.activeDraft : null
  const isOwner =
    !!activeDraft &&
    actor.role !== "admin" &&
    activeDraft.ownerUserId === actor.userId &&
    activeDraft.ownerRole === actor.role &&
    doc.holderRole === actor.role
  const reviewable =
    !!activeDraft &&
    doc.status === "submitted" &&
    doc.holderRole === "editor" &&
    activeDraft.ownerRole === "editor" &&
    activeDraft.ownerUserId === doc.project.editorId &&
    (actor.role === "admin" || (actor.role === "editor" && actor.userId === doc.project.editorId))
  const releaseUnlocked = !(doc.stageCode === "release" && doc.project.releaseStatus === "locked")
  const stagePlan = findStagePlan(doc)
  const canSubmitStage =
    doc.stageCode === "release"
      ? doc.project.releaseStatus !== "locked"
      : stagePlan?.gateStatus !== "locked"

  return {
    canView: true,
    canEditContent: projectWritable && releaseUnlocked && isOwner,
    canSave: projectWritable && releaseUnlocked && isOwner,
    canSubmit:
      projectWritable &&
      releaseUnlocked &&
      isOwner &&
      actor.role === "author" &&
      doc.holderRole === "author" &&
      canSubmitStage,
    canReturn: projectWritable && reviewable,
    canApprove: projectWritable && reviewable,
    canReadHistory: true,
  }
}

function toRevisionListItem(revision: RevisionRecord, finalRevisionId: bigint | null): DocRevisionListItem {
  return {
    revisionId: revision.revisionId.toString(),
    docId: revision.docId.toString(),
    revisionNo: revision.revisionNo,
    baseRevisionId: revision.baseRevisionId?.toString() ?? null,
    baseRevisionNo: revision.baseRevision?.revisionNo ?? null,
    fromDraftId: revision.fromDraftId.toString(),
    action: dbRevisionActionToApiAction(revision.action),
    actorRole: revision.actorRole,
    actorUserId: revision.actorUserId.toString(),
    actorName: userName(revision.actor),
    handoffNote: revision.handoffNote,
    contentHash: revision.contentHash,
    wordCount: revision.wordCount,
    commentCount: revision.commentCount,
    suggestionCount: revision.suggestionCount,
    revisionMarkCount: revision.revisionMarkCount,
    createdAt: revision.createdAt.toISOString(),
    isFinal: finalRevisionId === revision.revisionId,
  }
}

function toCurrentView(actor: ApiCurrentUser, doc: WorkflowDocRecord): DocCurrentView {
  const docMeta = toDocMeta(doc)
  const permissions = toPermissions(actor, doc)
  const project = toProjectSummary(doc)

  if (doc.activeDraft && doc.activeDraft.status === "active") {
    return {
      doc: docMeta,
      permissions,
      project,
      source: {
        kind: "draft",
        draftId: doc.activeDraft.draftId.toString(),
        docId: doc.activeDraft.docId.toString(),
        ownerRole: doc.activeDraft.ownerRole,
        ownerUserId: doc.activeDraft.ownerUserId.toString(),
        baseRevisionId: doc.activeDraft.baseRevisionId?.toString() ?? null,
        lockVersion: doc.activeDraft.lockVersion,
        saveCount: doc.activeDraft.saveCount,
        createdAt: doc.activeDraft.createdAt.toISOString(),
        updatedAt: doc.activeDraft.updatedAt.toISOString(),
        contentSchemaVersion: doc.activeDraft.contentSchemaVersion,
        contentJson: doc.activeDraft.contentJson as Record<string, unknown>,
        wordCount: doc.activeDraft.wordCount,
        plainText: doc.activeDraft.plainText,
        cleanText: doc.activeDraft.cleanText,
        exportText: doc.activeDraft.exportText,
        summary: doc.activeDraft.summary,
        commentCount: doc.activeDraft.commentCount,
        suggestionCount: doc.activeDraft.suggestionCount,
        revisionMarkCount: doc.activeDraft.revisionMarkCount,
      },
    }
  }

  if (doc.status === "approved" && doc.finalRevision) {
    return {
      doc: docMeta,
      permissions,
      project,
      source: {
        kind: "final_revision",
        revisionId: doc.finalRevision.revisionId.toString(),
        docId: doc.finalRevision.docId.toString(),
        revisionNo: doc.finalRevision.revisionNo,
        baseRevisionId: doc.finalRevision.baseRevisionId?.toString() ?? null,
        fromDraftId: doc.finalRevision.fromDraftId.toString(),
        action: dbRevisionActionToApiAction(doc.finalRevision.action),
        actorRole: doc.finalRevision.actorRole,
        actorUserId: doc.finalRevision.actorUserId.toString(),
        actorName: userName(doc.finalRevision.actor),
        handoffNote: doc.finalRevision.handoffNote,
        contentHash: doc.finalRevision.contentHash,
        createdAt: doc.finalRevision.createdAt.toISOString(),
        contentSchemaVersion: doc.finalRevision.contentSchemaVersion,
        contentJson: doc.finalRevision.contentJson as Record<string, unknown>,
        wordCount: doc.finalRevision.wordCount,
        plainText: doc.finalRevision.plainText,
        cleanText: doc.finalRevision.cleanText,
        exportText: doc.finalRevision.exportText,
        summary: doc.finalRevision.summary,
        commentCount: doc.finalRevision.commentCount,
        suggestionCount: doc.finalRevision.suggestionCount,
        revisionMarkCount: doc.finalRevision.revisionMarkCount,
      },
    }
  }

  throw new ApiError({
    status: 409,
    code: "DOC_SOURCE_MISSING",
    message: "当前 Doc 缺少可读取的稿件内容",
  })
}

async function writeOperationLog(tx: TxClient, input: OperationLogInput) {
  await tx.operationLog.create({
    data: {
      actorUserId: input.actor.userId,
      actorRole: input.actor.role,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      projectId: input.projectId,
      docId: input.docId,
      beforeJson: input.beforeJson,
      afterJson: input.afterJson,
      metadataJson: input.metadataJson,
    },
  })
}

function makeReviewTodoKey(docId: bigint) {
  return `doc_review:${docId.toString()}`
}

function makeReturnTodoKey(docId: bigint) {
  return `doc_return:${docId.toString()}`
}

async function closeTodoByOpenKey(tx: TxClient, openDedupeKey: string, now: Date) {
  await tx.todoItem.updateMany({
    where: {
      openDedupeKey,
      status: "open",
    },
    data: {
      status: "done",
      completedAt: now,
      openDedupeKey: null,
    },
  })
}

async function closeAllDocTodos(tx: TxClient, docId: bigint, now: Date) {
  await tx.todoItem.updateMany({
    where: {
      docId,
      status: "open",
    },
    data: {
      status: "done",
      completedAt: now,
      openDedupeKey: null,
    },
  })
}

async function upsertReviewTodo(tx: TxClient, doc: WorkflowDocRecord, now: Date, submitNote: string | null) {
  const openDedupeKey = makeReviewTodoKey(doc.docId)
  const stagePlan = assertDocStagePlanExists(doc)
  const messageKey = submitNote ? "todos.reviewWithNote" : "todos.review"
  const messageParams: Prisma.InputJsonObject = submitNote
    ? {
        projectTitle: doc.project.title,
        docTitle: doc.title,
        // 作者提交说明要进入待审待办，否则编辑从待办入口看不到作者交接信息。
        submitNote,
      }
    : {
        projectTitle: doc.project.title,
        docTitle: doc.title,
      }
  const description = submitNote
    ? `作者已提交《${doc.project.title}》的 ${doc.title}，请进入审核。提交说明：${submitNote}`
    : `作者已提交《${doc.project.title}》的 ${doc.title}，请进入审核。`

  await tx.todoItem.upsert({
    where: {
      openDedupeKey,
    },
    update: {
      recipientUserId: doc.project.editorId,
      todoType: "doc_review",
      messageKey,
      messageParams,
      title: `Doc 待审：${doc.title}`,
      description,
      projectId: doc.project.projectId,
      docId: doc.docId,
      entityType: "doc",
      entityId: doc.docId,
      status: "open",
      isRead: false,
      readAt: null,
      dueAt: stagePlan.dueAt,
      completedAt: null,
      cancelledAt: null,
      dedupeKey: openDedupeKey,
      openDedupeKey,
      updatedAt: now,
    },
    create: {
      recipientUserId: doc.project.editorId,
      todoType: "doc_review",
      messageKey,
      messageParams,
      title: `Doc 待审：${doc.title}`,
      description,
      projectId: doc.project.projectId,
      docId: doc.docId,
      entityType: "doc",
      entityId: doc.docId,
      status: "open",
      isRead: false,
      readAt: null,
      dueAt: stagePlan.dueAt,
      dedupeKey: openDedupeKey,
      openDedupeKey,
    },
  })
}

async function upsertReturnTodo(tx: TxClient, doc: WorkflowDocRecord, now: Date, returnNote: string) {
  const openDedupeKey = makeReturnTodoKey(doc.docId)
  const stagePlan = assertDocStagePlanExists(doc)
  const messageKey = "todos.returnWithNote"
  // 退回原因不只写入 Revision，还要进入待办详情；作者通常先看待办列表，
  // 如果这里仍然只保存泛化描述，就会出现“编辑填写了备注但作者入口看不到”的问题。
  const description = `编辑已退回《${doc.project.title}》的 ${doc.title}，请按意见修改后重新提交。退回原因：${returnNote}`

  await tx.todoItem.upsert({
    where: {
      openDedupeKey,
    },
    update: {
      recipientUserId: doc.project.authorId,
      todoType: "doc_return",
      messageKey,
      messageParams: {
        projectTitle: doc.project.title,
        docTitle: doc.title,
        // 将退回原因放进结构化参数，保证中文、英文界面都能通过同一模板渲染真实备注。
        returnNote,
      },
      title: `Doc 待改：${doc.title}`,
      description,
      projectId: doc.project.projectId,
      docId: doc.docId,
      entityType: "doc",
      entityId: doc.docId,
      status: "open",
      isRead: false,
      readAt: null,
      dueAt: stagePlan.dueAt,
      completedAt: null,
      cancelledAt: null,
      dedupeKey: openDedupeKey,
      openDedupeKey,
      updatedAt: now,
    },
    create: {
      recipientUserId: doc.project.authorId,
      todoType: "doc_return",
      messageKey,
      messageParams: {
        projectTitle: doc.project.title,
        docTitle: doc.title,
        // 新建待办与更新待办使用相同参数，避免重复退回时旧备注残留在作者端。
        returnNote,
      },
      title: `Doc 待改：${doc.title}`,
      description,
      projectId: doc.project.projectId,
      docId: doc.docId,
      entityType: "doc",
      entityId: doc.docId,
      status: "open",
      isRead: false,
      readAt: null,
      dueAt: stagePlan.dueAt,
      dedupeKey: openDedupeKey,
      openDedupeKey,
    },
  })
}

async function createNotification(
  tx: TxClient,
  input: {
    recipientUserId: bigint
    type: string
    messageKey: string
    messageParams: Prisma.InputJsonObject
    title: string
    body: string
    projectId: bigint
    docId: bigint
    entityId: bigint
  },
) {
  await tx.notification.create({
    data: {
      recipientUserId: input.recipientUserId,
      type: input.type,
      messageKey: input.messageKey,
      messageParams: input.messageParams,
      title: input.title,
      body: input.body,
      projectId: input.projectId,
      docId: input.docId,
      entityType: "doc",
      entityId: input.entityId,
    },
  })
}

async function getNextRevisionNo(tx: TxClient, docId: bigint) {
  const latestRevision = await tx.docRevision.findFirst({
    where: {
      docId,
    },
    orderBy: {
      revisionNo: "desc",
    },
    select: {
      revisionNo: true,
    },
  })

  return (latestRevision?.revisionNo ?? 0) + 1
}

async function sealDraftWithOptimisticLock(
  tx: TxClient,
  draftId: bigint,
  lockVersion: number,
  now: Date,
) {
  const result = await tx.docCurrentDraft.updateMany({
    where: {
      draftId,
      status: "active",
      lockVersion,
    },
    data: {
      status: "sealed",
      sealedAt: now,
      activeDocKey: null,
    },
  })

  if (result.count !== 1) {
    throw new ApiError({
      status: 409,
      code: "DOC_LOCK_VERSION_CONFLICT",
      message: "稿件已在其他窗口被更新，请刷新后重试",
    })
  }
}

async function createRevisionFromDraft(
  tx: TxClient,
  input: {
    doc: WorkflowDocRecord
    activeDraft: NonNullable<WorkflowDocRecord["activeDraft"]>
    actor: ApiCurrentUser
    action: "author_submit" | "editor_reject" | "editor_approve"
    handoffNote?: string | null
  },
) {
  const revisionNo = await getNextRevisionNo(tx, input.doc.docId)

  return tx.docRevision.create({
    data: {
      docId: input.doc.docId,
      revisionNo,
      baseRevisionId: input.activeDraft.baseRevisionId,
      fromDraftId: input.activeDraft.draftId,
      contentSchemaVersion: input.activeDraft.contentSchemaVersion,
      contentJson: asInputJson(input.activeDraft.contentJson),
      wordCount: input.activeDraft.wordCount,
      plainText: input.activeDraft.plainText,
      cleanText: input.activeDraft.cleanText,
      exportText: input.activeDraft.exportText,
      summary: input.activeDraft.summary,
      commentCount: input.activeDraft.commentCount,
      suggestionCount: input.activeDraft.suggestionCount,
      revisionMarkCount: input.activeDraft.revisionMarkCount,
      action: input.action,
      actorRole: input.actor.role,
      actorUserId: input.actor.userId,
      handoffNote: trimToNull(input.handoffNote ?? null),
      contentHash: hashJson(asInputJson(input.activeDraft.contentJson)),
    },
    select: revisionSelect,
  })
}

async function createActiveDraft(
  tx: TxClient,
  input: {
    docId: bigint
    ownerRole: "author" | "editor"
    ownerUserId: bigint
    baseRevisionId: bigint | null
    contentSchemaVersion: number
    contentJson: Prisma.InputJsonValue
    wordCount: number
    plainText: string | null
    cleanText: string | null
    exportText: string | null
    summary: string | null
    commentCount: number
    suggestionCount: number
    revisionMarkCount: number
  },
) {
  return tx.docCurrentDraft.create({
    data: {
      docId: input.docId,
      ownerRole: input.ownerRole,
      ownerUserId: input.ownerUserId,
      baseRevisionId: input.baseRevisionId,
      contentSchemaVersion: input.contentSchemaVersion,
      contentJson: input.contentJson,
      wordCount: input.wordCount,
      plainText: input.plainText,
      cleanText: input.cleanText,
      exportText: input.exportText,
      summary: input.summary,
      commentCount: input.commentCount,
      suggestionCount: input.suggestionCount,
      revisionMarkCount: input.revisionMarkCount,
      status: "active",
      activeDocKey: makeActiveDocKey(input.docId),
    },
    select: activeDraftSelect,
  })
}

async function ensureOutlineDocForProject(tx: TxClient, doc: WorkflowDocRecord, now: Date) {
  const existing = await tx.doc.findFirst({
    where: {
      projectId: doc.project.projectId,
      docType: "outline",
      isDeleted: false,
    },
    select: {
      docId: true,
    },
  })

  if (existing) {
    return existing.docId
  }

  const outlineDoc = await tx.doc.create({
    data: {
      projectId: doc.project.projectId,
      docType: "outline",
      stageCode: "outline",
      title: "细纲",
      status: "draft",
      holderRole: "author",
      currentWordCount: 0,
      currentPlainText: null,
      currentCleanText: null,
      summary: null,
      lastAction: null,
      lastActorId: null,
      lastActionAt: null,
      createdAt: now,
      updatedAt: now,
      singleDocKey: makeSingleDocKey(doc.project.projectId, "outline"),
    },
    select: {
      docId: true,
    },
  })

  const outlineDraft = await createActiveDraft(tx, {
    docId: outlineDoc.docId,
    ownerRole: "author",
    ownerUserId: doc.project.authorId,
    baseRevisionId: null,
    contentSchemaVersion: DEFAULT_CONTENT_SCHEMA_VERSION,
    contentJson: createNovelDocV1({
      docId: outlineDoc.docId,
      docType: "outline",
      title: "细纲",
      createdAt: now,
      updatedAt: now,
    }) as unknown as Prisma.InputJsonObject,
    wordCount: 0,
    plainText: null,
    cleanText: null,
    exportText: null,
    summary: null,
    commentCount: 0,
    suggestionCount: 0,
    revisionMarkCount: 0,
  })

  await tx.doc.update({
    where: {
      docId: outlineDoc.docId,
    },
    data: {
      activeDraftId: outlineDraft.draftId,
    },
  })

  return outlineDoc.docId
}

async function completeStagePlan(tx: TxClient, projectId: bigint, stageCode: (typeof STAGE_ORDER)[number], now: Date) {
  const stagePlan = await tx.projectStagePlan.findFirst({
    where: {
      projectId,
      stageCode,
    },
  })

  if (!stagePlan) {
    return null
  }

  await tx.projectStagePlan.update({
    where: {
      stagePlanId: stagePlan.stagePlanId,
    },
    data: {
      gateStatus: "completed",
      timelineStatus: "completed",
      completedAt: now,
      startedAt: stagePlan.startedAt ?? now,
      unlockedAt: stagePlan.unlockedAt ?? now,
      dueAt: stagePlan.dueAt ?? addDays(now, stagePlan.planDays),
    },
  })

  return stagePlan
}

async function unlockStagePlan(tx: TxClient, projectId: bigint, stageCode: (typeof STAGE_ORDER)[number], now: Date) {
  const stagePlan = await tx.projectStagePlan.findFirst({
    where: {
      projectId,
      stageCode,
    },
  })

  if (!stagePlan || stagePlan.gateStatus === "completed") {
    return stagePlan
  }

  const startedAt = stagePlan.startedAt ?? now

  await tx.projectStagePlan.update({
    where: {
      stagePlanId: stagePlan.stagePlanId,
    },
    data: {
      gateStatus: "unlocked",
      timelineStatus: "in_progress",
      unlockedAt: stagePlan.unlockedAt ?? now,
      startedAt,
      dueAt: stagePlan.dueAt ?? addDays(startedAt, stagePlan.planDays),
    },
  })

  return stagePlan
}

async function advanceProjectAfterApprove(tx: TxClient, doc: WorkflowDocRecord, now: Date) {
  // 阶段推进只在审核通过时触发，且当前批次只覆盖梗概/细纲/全文质检三类更新。
  if (doc.stageCode === "synopsis") {
    await completeStagePlan(tx, doc.project.projectId, "synopsis", now)
    await unlockStagePlan(tx, doc.project.projectId, "outline", now)
    const outlineDocId = await ensureOutlineDocForProject(tx, doc, now)

    await tx.project.update({
      where: {
        projectId: doc.project.projectId,
      },
      data: {
        currentStage: "outline",
      },
    })

    return {
      nextProjectStage: "outline",
      createdOutlineDocId: outlineDocId.toString(),
    }
  }

  if (doc.stageCode === "outline") {
    await completeStagePlan(tx, doc.project.projectId, "outline", now)
    await unlockStagePlan(tx, doc.project.projectId, "chapter", now)

    await tx.project.update({
      where: {
        projectId: doc.project.projectId,
      },
      data: {
        currentStage: "chapter",
      },
    })

    return {
      nextProjectStage: "chapter",
    }
  }

  if (doc.stageCode === "release") {
    await completeStagePlan(tx, doc.project.projectId, "release", now)

    await tx.project.update({
      where: {
        projectId: doc.project.projectId,
      },
      data: {
        releaseStatus: "approved",
        currentStage: "release",
      },
    })

    return {
      nextProjectStage: "release",
      releaseStatus: "approved",
    }
  }

  return {
    nextProjectStage: doc.project.currentStage,
  }
}

export async function getCurrentDocView(actor: ApiCurrentUser, docIdValue: string): Promise<DocCurrentView> {
  const docId = parseBigIntId(docIdValue, "Doc ID")
  const doc = await findVisibleDocOrThrow(prisma, actor, docId)

  return toCurrentView(actor, doc)
}

export async function listDocRevisions(actor: ApiCurrentUser, docIdValue: string): Promise<DocRevisionListResponse> {
  const docId = parseBigIntId(docIdValue, "Doc ID")
  const doc = await findVisibleDocOrThrow(prisma, actor, docId)

  const revisions = await prisma.docRevision.findMany({
    where: {
      docId: doc.docId,
    },
    orderBy: {
      revisionNo: "desc",
    },
    select: revisionSelect,
  })

  return {
    doc: toDocMeta(doc),
    project: toProjectSummary(doc),
    revisions: revisions.map((item) => toRevisionListItem(item, doc.finalRevisionId)),
  }
}

export async function getDocRevisionDetail(
  actor: ApiCurrentUser,
  docIdValue: string,
  revisionIdValue: string,
): Promise<DocRevisionDetail> {
  const docId = parseBigIntId(docIdValue, "Doc ID")
  const revisionId = parseBigIntId(revisionIdValue, "Revision ID")
  const doc = await findVisibleDocOrThrow(prisma, actor, docId)

  const revision = await prisma.docRevision.findFirst({
    where: {
      revisionId,
      docId: doc.docId,
    },
    select: revisionSelect,
  })

  if (!revision) {
    throw new ApiError({
      status: 404,
      code: "DOC_REVISION_NOT_FOUND",
      message: "Revision 不存在",
    })
  }

  return {
    revisionId: revision.revisionId.toString(),
    docId: revision.docId.toString(),
    revisionNo: revision.revisionNo,
    baseRevisionId: revision.baseRevisionId?.toString() ?? null,
    baseRevisionNo: revision.baseRevision?.revisionNo ?? null,
    fromDraftId: revision.fromDraftId.toString(),
    action: dbRevisionActionToApiAction(revision.action),
    actorRole: revision.actorRole,
    actorUserId: revision.actorUserId.toString(),
    actorName: userName(revision.actor),
    handoffNote: revision.handoffNote,
    contentHash: revision.contentHash,
    createdAt: revision.createdAt.toISOString(),
    isFinal: doc.finalRevisionId === revision.revisionId,
    contentSchemaVersion: revision.contentSchemaVersion,
    contentJson: revision.contentJson as Record<string, unknown>,
    wordCount: revision.wordCount,
    plainText: revision.plainText,
    cleanText: revision.cleanText,
    exportText: revision.exportText,
    summary: revision.summary,
    commentCount: revision.commentCount,
    suggestionCount: revision.suggestionCount,
    revisionMarkCount: revision.revisionMarkCount,
    doc: toDocMeta(doc),
    project: toProjectSummary(doc),
  }
}

export async function saveDocDraft(
  actor: ApiCurrentUser,
  docIdValue: string,
  input: SaveDocInput,
): Promise<DocCurrentView> {
  const docId = parseBigIntId(docIdValue, "Doc ID")
  const payload = normalizeSavePayload(input)
  const now = new Date()

  assertCleanTextConsistency({
    plainText: payload.plainText,
    cleanText: payload.cleanText,
    commentCount: payload.commentCount,
    suggestionCount: payload.suggestionCount,
    revisionMarkCount: payload.revisionMarkCount,
  })

  await prisma.$transaction(async (tx) => {
    const doc = await findVisibleDocOrThrow(tx, actor, docId)
    assertProjectWritable(doc)
    assertSaveGate(doc)
    const activeDraft = assertEditableByOwner(doc, actor)

    const updatedCount = await tx.docCurrentDraft.updateMany({
      where: {
        draftId: activeDraft.draftId,
        status: "active",
        lockVersion: input.lockVersion,
      },
      data: {
        contentSchemaVersion: payload.contentSchemaVersion,
        contentJson: payload.contentJson,
        wordCount: payload.wordCount,
        plainText: payload.plainText,
        cleanText: payload.cleanText,
        exportText: payload.exportText,
        summary: payload.summary,
        commentCount: payload.commentCount,
        suggestionCount: payload.suggestionCount,
        revisionMarkCount: payload.revisionMarkCount,
        lockVersion: {
          increment: 1,
        },
        saveCount: {
          increment: 1,
        },
      },
    })

    if (updatedCount.count !== 1) {
      throw new ApiError({
        status: 409,
        code: "DOC_LOCK_VERSION_CONFLICT",
        message: "稿件已在其他窗口被更新，请刷新后重试",
      })
    }

    await tx.doc.update({
      where: {
        docId: doc.docId,
      },
      data: {
        currentWordCount: payload.wordCount,
        currentPlainText: payload.plainText,
        currentCleanText: payload.cleanText,
        summary: payload.summary,
        lastAction: actor.role === "author" ? "author_save" : "editor_save",
        lastActorId: actor.userId,
        lastActionAt: now,
      },
    })

    await writeOperationLog(tx, {
      actor,
      action: "doc.save",
      entityType: "doc",
      entityId: doc.docId,
      projectId: doc.project.projectId,
      docId: doc.docId,
      beforeJson: {
        draftId: activeDraft.draftId.toString(),
        holderRole: doc.holderRole,
        lockVersion: activeDraft.lockVersion,
        wordCount: activeDraft.wordCount,
      },
      afterJson: {
        draftId: activeDraft.draftId.toString(),
        holderRole: doc.holderRole,
        lockVersion: activeDraft.lockVersion + 1,
        wordCount: payload.wordCount,
      },
      metadataJson: {
        commentCount: payload.commentCount,
        suggestionCount: payload.suggestionCount,
        revisionMarkCount: payload.revisionMarkCount,
      },
    })
  })

  return getCurrentDocView(actor, docIdValue)
}

export async function submitDoc(
  actor: ApiCurrentUser,
  docIdValue: string,
  input: SubmitDocInput,
): Promise<DocCurrentView> {
  const docId = parseBigIntId(docIdValue, "Doc ID")
  const submitNote = trimToNull(input.submitNote ?? null)
  const now = new Date()

  try {
    await prisma.$transaction(async (tx) => {
      const doc = await findVisibleDocOrThrow(tx, actor, docId)
      assertProjectWritable(doc)
      assertSaveGate(doc)
      assertSubmitGate(doc)
      const activeDraft = assertEditableByOwner(doc, actor)

      if (actor.role !== "author" || doc.holderRole !== "author") {
        throw new ApiError({
          status: 403,
          code: "DOC_SUBMIT_FORBIDDEN",
          message: "只有当前持有作者稿件的作者本人可以提交审核",
        })
      }

      if (doc.status !== "draft" && doc.status !== "rejected") {
        throw new ApiError({
          status: 409,
          code: "DOC_SUBMIT_STATE_INVALID",
          message: "当前 Doc 状态不能提交审核",
        })
      }

      await sealDraftWithOptimisticLock(tx, activeDraft.draftId, input.lockVersion, now)

      const revision = await createRevisionFromDraft(tx, {
        doc,
        activeDraft,
        actor,
        action: "author_submit",
        handoffNote: submitNote,
      })

      const nextDraft = await createActiveDraft(tx, {
        docId: doc.docId,
        ownerRole: "editor",
        ownerUserId: doc.project.editorId,
        baseRevisionId: revision.revisionId,
        contentSchemaVersion: activeDraft.contentSchemaVersion,
        contentJson: asInputJson(activeDraft.contentJson),
        wordCount: activeDraft.wordCount,
        plainText: activeDraft.plainText,
        cleanText: activeDraft.cleanText,
        exportText: activeDraft.exportText,
        summary: activeDraft.summary,
        commentCount: activeDraft.commentCount,
        suggestionCount: activeDraft.suggestionCount,
        revisionMarkCount: activeDraft.revisionMarkCount,
      })

      await tx.doc.update({
        where: {
          docId: doc.docId,
        },
        data: {
          status: "submitted",
          holderRole: "editor",
          activeDraftId: nextDraft.draftId,
          latestRevisionId: revision.revisionId,
          currentWordCount: activeDraft.wordCount,
          currentPlainText: activeDraft.plainText,
          currentCleanText: activeDraft.cleanText,
          summary: activeDraft.summary,
          lastAction: "author_submit",
          lastActorId: actor.userId,
          lastActionAt: now,
          lastHandoffNote: submitNote,
          submittedAt: now,
        },
      })

      await closeTodoByOpenKey(tx, makeReturnTodoKey(doc.docId), now)
      await upsertReviewTodo(tx, doc, now, submitNote)

      const submitMessageKey = submitNote ? "notifications.docSubmitWithNote" : "notifications.docSubmit"
      const submitMessageParams: Prisma.InputJsonObject = submitNote
        ? {
            projectTitle: doc.project.title,
            docTitle: doc.title,
            // 作者提交说明进入通知参数，保证编辑在通知中心也能看到交接重点。
            submitNote,
          }
        : {
            projectTitle: doc.project.title,
            docTitle: doc.title,
          }
      await createNotification(tx, {
        recipientUserId: doc.project.editorId,
        type: "doc_submitted_for_review",
        messageKey: submitMessageKey,
        messageParams: submitMessageParams,
        title: "Doc 已提交待审",
        body: submitNote
          ? `作者已提交《${doc.project.title}》的 ${doc.title}，请及时审核。提交说明：${submitNote}`
          : `作者已提交《${doc.project.title}》的 ${doc.title}，请及时审核。`,
        projectId: doc.project.projectId,
        docId: doc.docId,
        entityId: doc.docId,
      })

      await writeOperationLog(tx, {
        actor,
        action: "doc.submit",
        entityType: "doc",
        entityId: doc.docId,
        projectId: doc.project.projectId,
        docId: doc.docId,
        beforeJson: {
          status: doc.status,
          holderRole: doc.holderRole,
          activeDraftId: doc.activeDraftId?.toString() ?? null,
        },
        afterJson: {
          status: "submitted",
          holderRole: "editor",
          activeDraftId: nextDraft.draftId.toString(),
          latestRevisionId: revision.revisionId.toString(),
        },
        metadataJson: {
          submitNote,
          sealedDraftId: activeDraft.draftId.toString(),
          revisionId: revision.revisionId.toString(),
        },
      })
    })
  } catch (error) {
    throw (
      translateUniqueConstraintError(error, [
        {
          constraintIncludes: ["active_doc_key"],
          code: "DOC_ACTIVE_DRAFT_CONFLICT",
          message: "当前 Doc 的活动草稿已在其他操作中切换，请刷新后重试",
        },
      ]) ?? error
    )
  }

  return getCurrentDocView(actor, docIdValue)
}

export async function returnDocToAuthor(
  actor: ApiCurrentUser,
  docIdValue: string,
  input: ReturnDocInput,
): Promise<DocCurrentView> {
  const docId = parseBigIntId(docIdValue, "Doc ID")
  const returnNote = trimToNull(input.returnNote)
  const now = new Date()

  if (!returnNote) {
    throw new ApiError({
      status: 400,
      code: "DOC_RETURN_NOTE_REQUIRED",
      message: "退回说明不能为空",
    })
  }

  try {
    await prisma.$transaction(async (tx) => {
      const doc = await findVisibleDocOrThrow(tx, actor, docId)
      assertProjectWritable(doc)
      assertReviewer(actor, doc)
      const activeDraft = assertReviewableState(doc)

      await sealDraftWithOptimisticLock(tx, activeDraft.draftId, input.lockVersion, now)

      const revision = await createRevisionFromDraft(tx, {
        doc,
        activeDraft,
        actor,
        action: "editor_reject",
        handoffNote: returnNote,
      })

      const nextDraft = await createActiveDraft(tx, {
        docId: doc.docId,
        ownerRole: "author",
        ownerUserId: doc.project.authorId,
        baseRevisionId: revision.revisionId,
        contentSchemaVersion: activeDraft.contentSchemaVersion,
        contentJson: asInputJson(activeDraft.contentJson),
        wordCount: activeDraft.wordCount,
        plainText: activeDraft.plainText,
        cleanText: activeDraft.cleanText,
        exportText: activeDraft.exportText,
        summary: activeDraft.summary,
        commentCount: activeDraft.commentCount,
        suggestionCount: activeDraft.suggestionCount,
        revisionMarkCount: activeDraft.revisionMarkCount,
      })

      await tx.doc.update({
        where: {
          docId: doc.docId,
        },
        data: {
          status: "rejected",
          holderRole: "author",
          activeDraftId: nextDraft.draftId,
          latestRevisionId: revision.revisionId,
          currentWordCount: activeDraft.wordCount,
          currentPlainText: activeDraft.plainText,
          currentCleanText: activeDraft.cleanText,
          summary: activeDraft.summary,
          lastAction: "editor_reject",
          lastActorId: actor.userId,
          lastActionAt: now,
          lastHandoffNote: returnNote,
          reviewedAt: now,
        },
      })

      await closeTodoByOpenKey(tx, makeReviewTodoKey(doc.docId), now)
      await upsertReturnTodo(tx, doc, now, returnNote)

      await createNotification(tx, {
        recipientUserId: doc.project.authorId,
        type: "doc_returned",
        messageKey: "notifications.docReturnWithNote",
        messageParams: {
          projectTitle: doc.project.title,
          docTitle: doc.title,
          // 通知中心同样走结构化模板；这里带上 returnNote 后作者无需进入历史版本也能看到原因。
          returnNote,
        },
        title: "Doc 已退回待改",
        body: `编辑已退回《${doc.project.title}》的 ${doc.title}，请根据意见修改后重新提交。退回原因：${returnNote}`,
        projectId: doc.project.projectId,
        docId: doc.docId,
        entityId: doc.docId,
      })

      await writeOperationLog(tx, {
        actor,
        action: "doc.return",
        entityType: "doc",
        entityId: doc.docId,
        projectId: doc.project.projectId,
        docId: doc.docId,
        beforeJson: {
          status: doc.status,
          holderRole: doc.holderRole,
          activeDraftId: doc.activeDraftId?.toString() ?? null,
        },
        afterJson: {
          status: "rejected",
          holderRole: "author",
          activeDraftId: nextDraft.draftId.toString(),
          latestRevisionId: revision.revisionId.toString(),
        },
        metadataJson: {
          returnNote,
          sealedDraftId: activeDraft.draftId.toString(),
          revisionId: revision.revisionId.toString(),
        },
      })
    })
  } catch (error) {
    throw (
      translateUniqueConstraintError(error, [
        {
          constraintIncludes: ["active_doc_key"],
          code: "DOC_ACTIVE_DRAFT_CONFLICT",
          message: "当前 Doc 的活动草稿已在其他操作中切换，请刷新后重试",
        },
      ]) ?? error
    )
  }

  return getCurrentDocView(actor, docIdValue)
}

export async function approveDoc(
  actor: ApiCurrentUser,
  docIdValue: string,
  input: ApproveDocInput,
): Promise<DocCurrentView> {
  const docId = parseBigIntId(docIdValue, "Doc ID")
  const approveNote = trimToNull(input.approveNote ?? null)
  const now = new Date()

  try {
    await prisma.$transaction(async (tx) => {
      const doc = await findVisibleDocOrThrow(tx, actor, docId)
      assertProjectWritable(doc)
      assertReviewer(actor, doc)
      const activeDraft = assertReviewableState(doc)

      await sealDraftWithOptimisticLock(tx, activeDraft.draftId, input.lockVersion, now)

      const revision = await createRevisionFromDraft(tx, {
        doc,
        activeDraft,
        actor,
        action: "editor_approve",
        handoffNote: approveNote,
      })

      await tx.doc.update({
        where: {
          docId: doc.docId,
        },
        data: {
          status: "approved",
          holderRole: "none",
          activeDraftId: null,
          latestRevisionId: revision.revisionId,
          finalRevisionId: revision.revisionId,
          currentWordCount: activeDraft.wordCount,
          currentPlainText: activeDraft.plainText,
          currentCleanText: activeDraft.cleanText,
          summary: activeDraft.summary,
          lastAction: "editor_approve",
          lastActorId: actor.userId,
          lastActionAt: now,
          lastHandoffNote: approveNote,
          reviewedAt: now,
          approvedAt: now,
        },
      })

      const stageAdvanceResult = await advanceProjectAfterApprove(tx, doc, now)

      await closeAllDocTodos(tx, doc.docId, now)

      await createNotification(tx, {
        recipientUserId: doc.project.authorId,
        type: "doc_approved",
        messageKey: approveNote ? "notifications.docApproveWithNote" : "notifications.docApprove",
        messageParams: approveNote
          ? {
              projectTitle: doc.project.title,
              docTitle: doc.title,
              // 审核通过说明同样是交接信息，不能只停留在 Revision 里。
              approveNote,
            }
          : {
              projectTitle: doc.project.title,
              docTitle: doc.title,
            },
        title: "Doc 审核通过",
        body: approveNote
          ? `《${doc.project.title}》的 ${doc.title} 已审核通过。审核说明：${approveNote}`
          : `《${doc.project.title}》的 ${doc.title} 已审核通过。`,
        projectId: doc.project.projectId,
        docId: doc.docId,
        entityId: doc.docId,
      })

      await writeOperationLog(tx, {
        actor,
        action: "doc.approve",
        entityType: "doc",
        entityId: doc.docId,
        projectId: doc.project.projectId,
        docId: doc.docId,
        beforeJson: {
          status: doc.status,
          holderRole: doc.holderRole,
          activeDraftId: doc.activeDraftId?.toString() ?? null,
          finalRevisionId: doc.finalRevisionId?.toString() ?? null,
          projectStage: doc.project.currentStage,
          releaseStatus: doc.project.releaseStatus,
        },
        afterJson: {
          status: "approved",
          holderRole: "none",
          activeDraftId: null,
          finalRevisionId: revision.revisionId.toString(),
          projectStage: stageAdvanceResult.nextProjectStage,
          releaseStatus: stageAdvanceResult.releaseStatus ?? doc.project.releaseStatus,
        },
        metadataJson: {
          approveNote,
          sealedDraftId: activeDraft.draftId.toString(),
          revisionId: revision.revisionId.toString(),
          stageAdvanceResult,
        },
      })
    })
  } catch (error) {
    throw (
      translateUniqueConstraintError(error, [
        {
          constraintIncludes: ["single_doc_key"],
          code: "DOC_SINGLE_STAGE_CONFLICT",
          message: "阶段单据已在其他操作中创建，请刷新后重试",
        },
        {
          constraintIncludes: ["active_doc_key"],
          code: "DOC_ACTIVE_DRAFT_CONFLICT",
          message: "当前 Doc 的活动草稿已在其他操作中切换，请刷新后重试",
        },
      ]) ?? error
    )
  }

  return getCurrentDocView(actor, docIdValue)
}
