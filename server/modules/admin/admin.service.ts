import "server-only"

import { randomBytes } from "crypto"

import bcrypt from "bcryptjs"
import { Prisma } from "@prisma/client"

import { revokeAllUserSessionsByUserId } from "@/server/auth/session"
import { prisma } from "@/server/db/prisma"
import { ApiError } from "@/server/shared/api-response"
import { buildDocxBuffer } from "@/server/shared/docx-export"
import { makeActiveBindingKey, makeActiveDocKey, translateUniqueConstraintError } from "@/server/shared/invariant-keys"
import { assertRole } from "@/server/shared/current-user"
import { makePaginationMeta, parsePagination } from "@/server/shared/pagination"
import { createNovelDocV1, isNovelDocV1, textToNovelParagraphs } from "@/lib/novel-doc"
import type { ApiCurrentUser } from "@/server/shared/current-user"
import type {
  AdminReportStats,
  ApprovalRequest,
  AuditLog,
  Binding,
  DashboardStats,
  ManagedUser,
  StagePlanDefaultItem,
  SysParam,
} from "@/types/admin"
import type { BadgeTone, ProjectLifecycle, ProjectStage, Role, UserStatus } from "@/types/domain"
import type {
  AuditLogSummary,
  ChapterDoc,
  GovernanceDocSummaryItem,
  GovernanceProjectDetail,
  ProjectItem,
  ProjectPersonOption,
  ReleaseDocStatus,
  StagePlan,
} from "@/types/project"

type TxClient = Prisma.TransactionClient

type ManagedUserInput = {
  username?: string
  name?: string
  role?: Role
  email?: string
  phone?: string | null
  biography?: string | null
  password?: string
}

type ApprovalRejectInput = {
  reason: string
}

type BindingInput = {
  editorId: string
  authorId: string
}

type SiMainTypeInput = {
  name?: string
  value?: string
  order?: number
  status?: "active" | "inactive"
}

type StagePlanDefaultsInput = {
  items: Array<{
    stage: "synopsis" | "outline" | "chapter" | "release"
    days: number
    warningDaysBeforeDue?: number
  }>
}

type ProjectAssignmentInput = {
  editorId?: string
  authorId?: string
  reason?: string | null
}

type ProjectStagePlansInput = {
  items: Array<{
    stage: "synopsis" | "outline" | "chapter" | "release"
    planDays: number
  }>
}

type ProjectTransitionAction = "complete" | "archive" | "cancel" | "restore"

const PROJECT_TRANSITION_MATRIX: Record<ProjectTransitionAction, ProjectLifecycle[]> = {
  complete: ["active"],
  archive: ["active", "completed"],
  cancel: ["active"],
  restore: ["archived", "cancelled"],
}

type ProjectFilters = {
  keyword?: string | null
  stage?: string | null
  lifecycle?: string | null
  editorId?: string | null
  authorId?: string | null
  overdue?: string | null
  page?: string | null
  pageSize?: string | null
}

type AuditFilters = {
  keyword?: string | null
  action?: string | null
}

type RangeKey = "7d" | "30d" | "90d" | "all"
type EditableProjectStage = Exclude<ProjectStage, "completed">

const stageCodeToUiStage: Record<"synopsis" | "outline" | "chapter" | "release", ProjectStage> = {
  synopsis: "synopsis",
  outline: "outline",
  chapter: "chapter",
  release: "release",
}

const uiStageToStageCode: Record<Exclude<ProjectStage, "completed">, "synopsis" | "outline" | "chapter" | "release"> = {
  synopsis: "synopsis",
  outline: "outline",
  chapter: "chapter",
  release: "release",
}

const stageOrder: Array<Exclude<ProjectStage, "completed">> = ["synopsis", "outline", "chapter", "release"]

const stageLabelMap: Record<Exclude<ProjectStage, "completed">, string> = {
  synopsis: "梗概",
  outline: "细纲",
  chapter: "正文",
  release: "质检",
}

const projectInclude = {
  sourceSi: {
    select: {
      siId: true,
      title: true,
      status: true,
    },
  },
  editor: {
    select: {
      userId: true,
      username: true,
      displayName: true,
    },
  },
  author: {
    select: {
      userId: true,
      username: true,
      displayName: true,
    },
  },
  stagePlans: {
    orderBy: {
      stageCode: "asc",
    },
  },
  docs: {
    where: {
      isDeleted: false,
    },
    include: {
      lastActor: {
        select: {
          username: true,
          displayName: true,
        },
      },
    },
    orderBy: [{ stageCode: "asc" }, { sortOrder: "asc" }, { chapterNo: "asc" }],
  },
  operationLogs: {
    include: {
      actor: {
        select: {
          username: true,
          displayName: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 8,
  },
} satisfies Prisma.ProjectInclude

type ProjectRecord = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>

function ensureAdmin(actor: ApiCurrentUser) {
  assertRole(actor, ["admin"])
}

async function assertManagedUserRoleChangeAllowed(input: {
  userId: bigint
  currentRole: Role
  nextRole: Role
  status: UserStatus
}) {
  if (input.currentRole === input.nextRole) {
    return
  }

  if (input.currentRole === "admin" && input.nextRole !== "admin" && input.status === "active") {
    const activeAdminTotal = await prisma.user.count({
      where: {
        role: "admin",
        status: "active",
      },
    })

    if (activeAdminTotal <= 1) {
      throw new ApiError({
        status: 409,
        code: "LAST_ADMIN_ROLE_CHANGE_FORBIDDEN",
        message: "系统至少需要保留一个活动管理员",
      })
    }
  }

  if (input.currentRole === "editor" && input.nextRole !== "editor") {
    const [bindingTotal, projectTotal, preissueTotal, reviewDocTotal] = await Promise.all([
      prisma.editorAuthorBinding.count({
        where: {
          editorId: input.userId,
          status: "active",
        },
      }),
      prisma.project.count({
        where: {
          editorId: input.userId,
          lifecycleStatus: "active",
        },
      }),
      prisma.siPreissue.count({
        where: {
          editorId: input.userId,
          status: "preissued",
        },
      }),
      prisma.doc.count({
        where: {
          holderRole: "editor",
          status: "submitted",
          project: {
            editorId: input.userId,
            lifecycleStatus: "active",
          },
        },
      }),
    ])

    if (bindingTotal + projectTotal + preissueTotal + reviewDocTotal > 0) {
      throw new ApiError({
        status: 409,
        code: "USER_ROLE_CHANGE_BLOCKED",
        message: "该编辑仍有关联作者、在管项目、活动预发或待审稿件，请先解绑、改派或处理后再变更角色",
      })
    }
  }

  if (input.currentRole === "author" && input.nextRole !== "author") {
    const [bindingTotal, projectTotal, preissueTotal, draftDocTotal] = await Promise.all([
      prisma.editorAuthorBinding.count({
        where: {
          authorId: input.userId,
          status: "active",
        },
      }),
      prisma.project.count({
        where: {
          authorId: input.userId,
          lifecycleStatus: "active",
        },
      }),
      prisma.siPreissue.count({
        where: {
          authorId: input.userId,
          status: "preissued",
        },
      }),
      prisma.doc.count({
        where: {
          holderRole: "author",
          status: {
            in: ["draft", "rejected"],
          },
          project: {
            authorId: input.userId,
            lifecycleStatus: "active",
          },
        },
      }),
    ])

    if (bindingTotal + projectTotal + preissueTotal + draftDocTotal > 0) {
      throw new ApiError({
        status: 409,
        code: "USER_ROLE_CHANGE_BLOCKED",
        message: "该作者仍有关联编辑、在写项目、活动预发或待改稿件，请先解绑、改派或处理后再变更角色",
      })
    }
  }
}

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

function formatDateTime(value: Date | null | undefined) {
  return value ? value.toISOString() : null
}

function userName(user: { username: string; displayName: string | null }) {
  return user.displayName ?? user.username
}

function holderRoleByDocStatus(status: "draft" | "submitted" | "rejected" | "approved") {
  if (status === "submitted") {
    return "editor" as const
  }

  if (status === "approved") {
    return "none" as const
  }

  return "author" as const
}

function draftOwnerRoleByDocStatus(status: "draft" | "submitted" | "rejected" | "approved") {
  return status === "submitted" ? ("editor" as const) : ("author" as const)
}

function stageByProjectDocs(input: {
  releaseStatus: "locked" | "unlocked" | "approved"
  hasOutlineDoc: boolean
  hasChapterDoc: boolean
  hasReleaseDoc: boolean
  synopsisApproved: boolean
  outlineApproved: boolean
}) {
  // restore 的目标不是“复原旧字段”，而是把项目重新拉回一个可继续协作的合法阶段。
  // 这里优先依据更靠后的真实 Doc 存在情况与通过情况回推当前阶段。
  if (input.releaseStatus !== "locked" || input.hasReleaseDoc) {
    return "release" as const
  }

  if (input.hasChapterDoc || input.outlineApproved) {
    return "chapter" as const
  }

  if (input.hasOutlineDoc || input.synopsisApproved) {
    return "outline" as const
  }

  return "synopsis" as const
}

async function ensureActiveDraftForRestore(
  tx: TxClient,
  input: {
    doc: {
      docId: bigint
      docType: "synopsis" | "outline" | "chapter" | "release"
      title: string
      status: "draft" | "submitted" | "rejected" | "approved"
      chapterNo: number | null
      activeDraftId: bigint | null
      currentWordCount: number
      currentPlainText: string | null
      currentCleanText: string | null
      summary: string | null
      projectId: bigint
      projectAuthorId: bigint
      projectEditorId: bigint
      finalRevision: {
        revisionId: bigint
        contentSchemaVersion: number
        contentJson: Prisma.JsonValue
        wordCount: number
        plainText: string | null
        cleanText: string | null
        exportText: string | null
        summary: string | null
        commentCount: number
        suggestionCount: number
        revisionMarkCount: number
      } | null
      latestRevision: {
        revisionId: bigint
        contentSchemaVersion: number
        contentJson: Prisma.JsonValue
        wordCount: number
        plainText: string | null
        cleanText: string | null
        exportText: string | null
        summary: string | null
        commentCount: number
        suggestionCount: number
        revisionMarkCount: number
      } | null
    }
    reopenApprovedReleaseDoc?: boolean
  },
) {
  if (input.doc.status === "approved" && !input.reopenApprovedReleaseDoc) {
    await tx.doc.update({
      where: {
        docId: input.doc.docId,
      },
      data: {
        activeDraftId: null,
        holderRole: "none",
      },
    })

    return
  }

  const activeDraft = await tx.docCurrentDraft.findFirst({
    where: {
      docId: input.doc.docId,
      status: "active",
    },
    select: {
      draftId: true,
    },
  })

  if (activeDraft) {
    await tx.doc.update({
      where: {
        docId: input.doc.docId,
      },
      data: {
        activeDraftId: activeDraft.draftId,
        holderRole: input.reopenApprovedReleaseDoc ? "author" : holderRoleByDocStatus(input.doc.status),
        status: input.reopenApprovedReleaseDoc ? "draft" : input.doc.status,
      },
    })

    return
  }

  const sourceRevision = input.doc.latestRevision ?? input.doc.finalRevision
  const nextOwnerRole = input.reopenApprovedReleaseDoc ? "author" : draftOwnerRoleByDocStatus(input.doc.status)
  const nextOwnerUserId = nextOwnerRole === "editor" ? input.doc.projectEditorId : input.doc.projectAuthorId
  const fallbackNow = new Date()
  const fallbackContentJson = createNovelDocV1({
    docId: input.doc.docId,
    docType: input.doc.docType,
    title: input.doc.title,
    createdAt: fallbackNow,
    updatedAt: fallbackNow,
    content: textToNovelParagraphs(input.doc.currentPlainText),
  })

  const createdDraft = await tx.docCurrentDraft.create({
    data: {
      docId: input.doc.docId,
      ownerRole: nextOwnerRole,
      ownerUserId: nextOwnerUserId,
      baseRevisionId: sourceRevision?.revisionId ?? null,
      contentSchemaVersion: sourceRevision?.contentSchemaVersion ?? 1,
      contentJson: (sourceRevision?.contentJson ?? fallbackContentJson) as unknown as Prisma.InputJsonValue,
      wordCount: sourceRevision?.wordCount ?? input.doc.currentWordCount,
      plainText: sourceRevision?.plainText ?? input.doc.currentPlainText,
      cleanText: sourceRevision?.cleanText ?? input.doc.currentCleanText,
      exportText: sourceRevision?.exportText ?? input.doc.currentCleanText ?? input.doc.currentPlainText,
      summary: sourceRevision?.summary ?? input.doc.summary,
      commentCount: sourceRevision?.commentCount ?? 0,
      suggestionCount: sourceRevision?.suggestionCount ?? 0,
      revisionMarkCount: sourceRevision?.revisionMarkCount ?? 0,
      status: "active",
      activeDocKey: makeActiveDocKey(input.doc.docId),
    },
    select: {
      draftId: true,
    },
  })

  await tx.doc.update({
    where: {
      docId: input.doc.docId,
    },
    data: {
      activeDraftId: createdDraft.draftId,
      holderRole: nextOwnerRole,
      status: input.reopenApprovedReleaseDoc ? "draft" : input.doc.status,
    },
  })
}

function userContact(user: { email: string; phone: string | null }) {
  return user.phone?.trim() ? `${user.phone} / ${user.email}` : user.email
}

function closeRegisterApprovalTodosQuery(userId: bigint, now: Date) {
  // 注册审批待办是“每个管理员一条”的持久化任务；
  // 审批通过或驳回时，需要一次性把所有管理员侧未完成记录关闭。
  return {
    where: {
      todoType: "register_approval",
      entityType: "user",
      entityId: userId,
      status: "open" as const,
    },
    data: {
      status: "done" as const,
      completedAt: now,
      openDedupeKey: null,
    },
  }
}

function dbDocStatusToUiStatus(status: "draft" | "submitted" | "rejected" | "approved") {
  return status === "rejected" ? "returned" : status
}

function dbProjectStageToUiStage(stage: "synopsis" | "outline" | "chapter" | "release" | "completed"): ProjectStage {
  if (stage === "completed") {
    return "completed"
  }

  return stageCodeToUiStage[stage]
}

function uiLifecycleTone(lifecycle: ProjectLifecycle): BadgeTone {
  if (lifecycle === "completed") return "success"
  if (lifecycle === "cancelled") return "danger"
  if (lifecycle === "active") return "info"
  return "neutral"
}

function stageTimingNote(stage: EditableProjectStage) {
  if (stage === "synopsis") return "确认转项目后开始"
  if (stage === "outline") return "梗概通过后开始"
  if (stage === "chapter") return "细纲通过后开始"
  return "手动解锁后开始"
}

function summarizeValue(value: Prisma.JsonValue | null | undefined) {
  if (value === undefined || value === null) return "—"
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)

  if (Array.isArray(value)) {
    return value.length === 0 ? "[]" : `${value.length} 项`
  }

  const record = value as Record<string, Prisma.JsonValue>
  const preferredKeys = [
    "status",
    "preissueStatus",
    "siStatus",
    "lifecycleStatus",
    "currentStage",
    "projectId",
    "editorId",
    "authorId",
    "reason",
  ]

  for (const key of preferredKeys) {
    if (key in record) {
      const fieldValue = record[key]
      return typeof fieldValue === "string" ? fieldValue : JSON.stringify(fieldValue)
    }
  }

  return JSON.stringify(record)
}

async function writeOperationLog(tx: TxClient, input: {
  actor: ApiCurrentUser
  action: string
  entityType: string
  entityId: bigint
  projectId?: bigint
  beforeJson?: Prisma.InputJsonValue
  afterJson?: Prisma.InputJsonValue
  metadataJson?: Prisma.InputJsonValue
}) {
  await tx.operationLog.create({
    data: {
      actorUserId: input.actor.userId,
      actorRole: input.actor.role,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      projectId: input.projectId,
      beforeJson: input.beforeJson,
      afterJson: input.afterJson,
      metadataJson: input.metadataJson,
    },
  })
}

function approvalStatus(status: UserStatus): ApprovalRequest["status"] {
  return status === "rejected" ? "rejected" : "pending"
}

function toManagedUser(user: {
  userId: bigint
  username: string
  displayName: string | null
  role: Role
  status: UserStatus
  email: string
  phone: string | null
  biography: string | null
  lastLoginAt: Date | null
  createdAt: Date
}): ManagedUser {
  return {
    id: user.userId.toString(),
    username: user.username,
    name: user.displayName ?? user.username,
    role: user.role,
    status: user.status,
    contact: userContact(user),
    email: user.email,
    phone: user.phone ?? undefined,
    biography: user.biography ?? undefined,
    lastLogin: formatDateTime(user.lastLoginAt),
    createdAt: user.createdAt.toISOString(),
  }
}

function toApprovalRequest(user: {
  userId: bigint
  username: string
  displayName: string | null
  email: string
  phone: string | null
  biography: string | null
  createdAt: Date
  status: UserStatus
  rejectedReason: string | null
}): ApprovalRequest {
  return {
    id: user.userId.toString(),
    username: user.username,
    penName: user.displayName ?? user.username,
    contact: userContact(user),
    appliedAt: user.createdAt.toISOString(),
    note: user.biography ?? "—",
    biography: user.biography ?? "",
    status: approvalStatus(user.status),
    rejectReason: user.rejectedReason ?? undefined,
  }
}

function toBinding(binding: {
  bindingId: bigint
  status: "active" | "inactive"
  boundAt: Date
  editor: { username: string; displayName: string | null; userId: bigint }
  author: { username: string; displayName: string | null; userId: bigint }
  boundByUser: { username: string; displayName: string | null }
}): Binding {
  return {
    id: binding.bindingId.toString(),
    editor: userName(binding.editor),
    editorId: binding.editor.userId.toString(),
    author: userName(binding.author),
    authorId: binding.author.userId.toString(),
    status: binding.status,
    createdAt: binding.boundAt.toISOString(),
    operator: userName(binding.boundByUser),
  }
}

function toSysParam(item: {
  mainTypeId: bigint
  name: string
  code: string
  sortOrder: number
  isActive: boolean
  createdAt: Date
}): SysParam {
  return {
    id: item.mainTypeId.toString(),
    name: item.name,
    value: item.code,
    status: item.isActive ? "active" : "inactive",
    order: item.sortOrder,
    createdAt: item.createdAt.toISOString(),
  }
}

function stageCodeToParamStage(stageCode: "synopsis" | "outline" | "chapter" | "release"): StagePlanDefaultItem["stage"] {
  return stageCode
}

function paramStageToStageCode(stage: StagePlanDefaultItem["stage"]) {
  return uiStageToStageCode[stage]
}

function makeAuditTarget(log: {
  entityType: string
  project?: { title: string } | null
  doc?: { title: string } | null
  storyIdea?: { title: string } | null
  actor?: { username: string; displayName: string | null } | null
}) {
  if (log.entityType === "project" && log.project) return `项目：${log.project.title}`
  if (log.entityType === "doc" && log.doc) return `Doc：${log.doc.title}`
  if (log.entityType === "story_idea" && log.storyIdea) return `SI：${log.storyIdea.title}`
  if (log.entityType === "user" && log.actor) return `用户：${userName(log.actor)}`
  return log.entityType
}

function toAuditLog(log: Prisma.OperationLogGetPayload<{
  include: {
    actor: { select: { username: true; displayName: true; role: true } }
    project: { select: { title: true } }
    doc: { select: { title: true } }
    storyIdea: { select: { title: true } }
  }
}>): AuditLog {
  return {
    id: log.logId.toString(),
    time: log.createdAt.toISOString(),
    operator: log.actor ? userName(log.actor) : "系统",
    role: (log.actor?.role ?? "admin") as Role,
    action: log.action,
    target: makeAuditTarget(log),
    before: summarizeValue(log.beforeJson),
    after: summarizeValue(log.afterJson),
    note: summarizeValue(log.metadataJson),
  }
}

function toAuditLogSummary(log: ProjectRecord["operationLogs"][number]): AuditLogSummary {
  return {
    id: log.logId.toString(),
    time: log.createdAt.toISOString(),
    operator: log.actor ? userName(log.actor) : "系统",
    action: log.action,
    before: summarizeValue(log.beforeJson),
    after: summarizeValue(log.afterJson),
  }
}

function toStagePlan(plan: ProjectRecord["stagePlans"][number]): StagePlan {
  // 项目阶段计划表只覆盖四个可编辑阶段，不会出现“完成”态，因此这里显式收窄类型。
  const stage = stageCodeToUiStage[plan.stageCode] as EditableProjectStage

  return {
    stage,
    planDays: plan.planDays,
    startAt: formatDateTime(plan.startedAt),
    dueAt: formatDateTime(plan.dueAt),
    finishedAt: formatDateTime(plan.completedAt),
    status: plan.timelineStatus,
    timingNote: stageTimingNote(stage),
  }
}

function projectReleaseDocStatus(project: ProjectRecord): ReleaseDocStatus {
  const releaseDoc = project.docs.find((doc) => doc.docType === "release")

  if (project.releaseStatus === "locked") {
    return "locked"
  }

  if (!releaseDoc) {
    return project.releaseStatus === "approved" ? "approved" : "unlocked"
  }

  const docStatus = dbDocStatusToUiStatus(releaseDoc.status)
  return docStatus
}

function toChapterDoc(doc: ProjectRecord["docs"][number]): ChapterDoc {
  return {
    id: doc.docId.toString(),
    order: doc.chapterNo ?? doc.sortOrder,
    title: doc.title,
    status: dbDocStatusToUiStatus(doc.status),
    holder: doc.holderRole,
    words: doc.currentWordCount,
    lastNote: doc.lastHandoffNote ?? "",
    lastOperator: doc.lastActor ? userName(doc.lastActor) : "系统",
    lastOperatedAt: formatDateTime(doc.lastActionAt) ?? doc.updatedAt.toISOString(),
    approved: doc.status === "approved",
  }
}

function makeDocSummary(project: ProjectRecord): GovernanceDocSummaryItem[] {
  const synopsisDoc = project.docs.find((doc) => doc.docType === "synopsis")
  const outlineDoc = project.docs.find((doc) => doc.docType === "outline")
  const chapterDocs = project.docs.filter((doc) => doc.docType === "chapter")
  const releaseDocStatus = projectReleaseDocStatus(project)

  return [
    {
      key: "synopsis",
      title: "梗概 Doc",
      statusLabel: synopsisDoc ? dbDocStatusToUiStatus(synopsisDoc.status) === "approved" ? "审核通过" : synopsisDoc.title : "未创建",
      tone: synopsisDoc?.status === "approved" ? "success" : synopsisDoc ? "info" : "neutral",
    },
    {
      key: "outline",
      title: "细纲 Doc",
      statusLabel: outlineDoc
        ? dbDocStatusToUiStatus(outlineDoc.status) === "approved"
          ? "审核通过"
          : outlineDoc.title
        : "未解锁",
      tone: outlineDoc?.status === "approved" ? "success" : outlineDoc ? "info" : "neutral",
    },
    {
      key: "chapter",
      title: "正文章节 Doc",
      statusLabel: `${chapterDocs.filter((doc) => doc.status === "approved").length}/${chapterDocs.length} 章通过`,
      tone: "info",
    },
    {
      key: "release",
      title: "质检 Doc",
      statusLabel:
        releaseDocStatus === "locked"
          ? "未解锁"
          : releaseDocStatus === "unlocked"
            ? "已解锁"
            : releaseDocStatus === "draft"
              ? "草稿"
              : releaseDocStatus === "submitted"
                ? "已提交待审"
                : releaseDocStatus === "returned"
                  ? "退回待改"
                  : "审核通过",
      tone:
        releaseDocStatus === "approved"
          ? "success"
          : releaseDocStatus === "returned"
            ? "warning"
            : releaseDocStatus === "submitted" || releaseDocStatus === "unlocked"
              ? "info"
              : "neutral",
    },
  ]
}

function toProjectItem(project: ProjectRecord): ProjectItem {
  const stage = dbProjectStageToUiStage(project.currentStage)
  const stagePlans = project.stagePlans.map(toStagePlan)
  const currentPlan = stage === "completed" ? null : stagePlans.find((item) => item.stage === stage)
  const chapterDocs = project.docs.filter((doc) => doc.docType === "chapter").map(toChapterDoc)

  return {
    id: project.projectId.toString(),
    title: project.title,
    sourceSi: project.sourceSi.title,
    sourceSiId: project.sourceSiId.toString(),
    editor: userName(project.editor),
    editorId: project.editorId.toString(),
    author: userName(project.author),
    authorId: project.authorId.toString(),
    stage,
    lifecycle: project.lifecycleStatus,
    planStatus: stage === "completed" ? "completed" : currentPlan?.status ?? "not_started",
    pendingDocs: project.docs.filter((doc) => doc.status !== "approved").length,
    overdue: project.stagePlans.some((plan) => plan.timelineStatus === "overdue"),
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    finishedAt: formatDateTime(project.completedAt),
    releaseDocStatus: projectReleaseDocStatus(project),
    totalChapters: chapterDocs.length,
    approvedChapters: chapterDocs.filter((item) => item.approved).length,
    stagePlans,
    chapters: chapterDocs,
  }
}

function toGovernanceProjectDetail(project: ProjectRecord): GovernanceProjectDetail {
  const base = toProjectItem(project)

  return {
    ...base,
    sourceSiStatus: project.sourceSi.status,
    docSummary: makeDocSummary(project),
    recentAuditLogs: project.operationLogs.map(toAuditLogSummary),
  }
}

function startDateByRange(range: RangeKey) {
  if (range === "all") return null

  const now = new Date()
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
}

function startOfToday() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

async function activeUserOptionsByRole(role: Role): Promise<ProjectPersonOption[]> {
  const users = await prisma.user.findMany({
    where: {
      role,
      status: "active",
    },
    select: {
      userId: true,
      username: true,
      displayName: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  })

  return users.map((user) => ({
    id: user.userId.toString(),
    name: userName(user),
  }))
}

async function ensureUserByRole(tx: TxClient, userId: bigint, role: Role) {
  const user = await tx.user.findFirst({
    where: {
      userId,
      role,
      status: "active",
    },
    select: {
      userId: true,
      username: true,
      displayName: true,
      email: true,
      phone: true,
    },
  })

  if (!user) {
    throw new ApiError({
      status: 400,
      code: "USER_NOT_FOUND",
      message: `${role === "editor" ? "编辑" : "作者"}不存在或不可用`,
    })
  }

  return user
}

async function dashboardStats(range: RangeKey = "30d"): Promise<DashboardStats> {
  const since = startDateByRange(range)
  const today = startOfToday()

  const [userTotal, editorTotal, authorTotal, projectTotal, completedProjectTotal, overdueStagePlans, pendingApprovalCount] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: "editor" } }),
      prisma.user.count({ where: { role: "author" } }),
      prisma.project.count(),
      prisma.project.count({ where: { lifecycleStatus: "completed" } }),
      prisma.projectStagePlan.findMany({
        where: {
          timelineStatus: "overdue",
          // 管理看板只统计仍在推进中的项目，避免已完成、归档、取消项目的历史逾期值长期污染指标。
          project: {
            lifecycleStatus: "active",
          },
        },
        select: {
          projectId: true,
        },
        distinct: ["projectId"],
      }),
      prisma.user.count({
        where: {
          status: "pending",
        },
      }),
    ])

  const [todaySubmitCount, todayReviewCount, todayReturnCount, stageGroups, authorAgg, editorAgg] = await Promise.all([
    prisma.docRevision.count({
      where: {
        action: "author_submit",
        createdAt: {
          gte: today,
        },
      },
    }),
    prisma.docRevision.count({
      where: {
        action: "editor_approve",
        createdAt: {
          gte: today,
        },
      },
    }),
    prisma.docRevision.count({
      where: {
        action: "editor_reject",
        createdAt: {
          gte: today,
        },
      },
    }),
    prisma.project.groupBy({
      by: ["currentStage"],
      _count: {
        _all: true,
      },
    }),
    prisma.docRevision.groupBy({
      by: ["actorUserId"],
      where: {
        action: "author_submit",
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      _sum: {
        wordCount: true,
      },
      orderBy: {
        _sum: {
          wordCount: "desc",
        },
      },
      take: 5,
    }),
    prisma.docRevision.groupBy({
      by: ["actorUserId"],
      where: {
        action: {
          in: ["editor_approve", "editor_reject"],
        },
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      _count: {
        actorUserId: true,
      },
      orderBy: {
        _count: {
          actorUserId: "desc",
        },
      },
      take: 5,
    }),
  ])

  const [authorUsers, editorUsers] = await Promise.all([
    prisma.user.findMany({
      where: {
        userId: {
          in: authorAgg.map((item) => item.actorUserId),
        },
      },
      select: {
        userId: true,
        username: true,
        displayName: true,
      },
    }),
    prisma.user.findMany({
      where: {
        userId: {
          in: editorAgg.map((item) => item.actorUserId),
        },
      },
      select: {
        userId: true,
        username: true,
        displayName: true,
      },
    }),
  ])

  const authorMap = new Map(authorUsers.map((user) => [user.userId.toString(), userName(user)]))
  const editorMap = new Map(editorUsers.map((user) => [user.userId.toString(), userName(user)]))
  const stageCountMap = new Map(
    stageGroups.map((item) => [dbProjectStageToUiStage(item.currentStage), item._count._all]),
  )

  return {
    userTotal,
    editorTotal,
    authorTotal,
    projectTotal,
    completedProjectTotal,
    overdueProjectTotal: overdueStagePlans.length,
    todaySubmitCount,
    todayReviewCount,
    todayReturnCount,
    stageCounts: [
      { stage: "synopsis", count: stageCountMap.get("synopsis") ?? 0 },
      { stage: "outline", count: stageCountMap.get("outline") ?? 0 },
      { stage: "chapter", count: stageCountMap.get("chapter") ?? 0 },
      { stage: "release", count: stageCountMap.get("release") ?? 0 },
      { stage: "completed", count: stageCountMap.get("completed") ?? 0 },
    ],
    authorRanking: authorAgg.map((item) => ({
      name: authorMap.get(item.actorUserId.toString()) ?? item.actorUserId.toString(),
      value: `${((item._sum.wordCount ?? 0) / 10000).toFixed(1)} 万字`,
    })),
    editorRanking: editorAgg.map((item) => ({
      name: editorMap.get(item.actorUserId.toString()) ?? item.actorUserId.toString(),
      value: `审核 ${item._count.actorUserId ?? 0} 次`,
    })),
    pendingApprovalCount,
  }
}

export async function getAdminDashboard(actor: ApiCurrentUser, range: RangeKey = "30d") {
  ensureAdmin(actor)

  return {
    stats: await dashboardStats(range),
  }
}

export async function getAdminReport(actor: ApiCurrentUser, range: RangeKey = "30d") {
  ensureAdmin(actor)

  const since = startDateByRange(range)
  const stats = await dashboardStats(range)

  const totalSubmittedWords = await prisma.docRevision.aggregate({
    where: {
      action: "author_submit",
      ...(since ? { createdAt: { gte: since } } : {}),
    },
    _sum: {
      wordCount: true,
    },
  })

  const report: AdminReportStats = {
    userCount: stats.userTotal,
    projectTotal: stats.projectTotal,
    completedProjectTotal: stats.completedProjectTotal,
    overdueProjectTotal: stats.overdueProjectTotal,
    totalSubmittedWords: totalSubmittedWords._sum.wordCount ?? 0,
    todaySubmitCount: stats.todaySubmitCount,
    todayReviewCount: stats.todayReviewCount,
    todayReturnCount: stats.todayReturnCount,
    stageCounts: stats.stageCounts.map((item) => ({
      label: item.stage === "completed" ? "完成" : stageLabelMap[item.stage],
      value: item.count,
    })),
    authorRanking: stats.authorRanking,
    editorRanking: stats.editorRanking,
  }

  return {
    stats: report,
  }
}

export async function listManagedUsers(actor: ApiCurrentUser) {
  ensureAdmin(actor)

  const users = await prisma.user.findMany({
    select: {
      userId: true,
      username: true,
      displayName: true,
      role: true,
      status: true,
      email: true,
      phone: true,
      biography: true,
      lastLoginAt: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  })

  return {
    users: users.map(toManagedUser),
  }
}

export async function createManagedUser(actor: ApiCurrentUser, input: ManagedUserInput) {
  ensureAdmin(actor)

  const username = trimToNull(input.username)
  const name = trimToNull(input.name)
  const email = trimToNull(input.email)
  const password = trimToNull(input.password)
  const biography = trimToNull(input.biography ?? null)
  const role = input.role

  if (!username || !name || !email || !password || !role) {
    throw new ApiError({
      status: 400,
      code: "INVALID_INPUT",
      message: "请完整填写用户名、姓名、角色、邮箱和密码",
    })
  }

  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ username }, { email }],
    },
    select: {
      userId: true,
    },
  })

  if (existing) {
    throw new ApiError({
      status: 409,
      code: "USER_EXISTS",
      message: "用户名或邮箱已存在",
    })
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        username,
        email,
        passwordHash,
        role,
        status: "active",
        displayName: name,
        phone: trimToNull(input.phone),
        biography,
      },
      select: {
        userId: true,
        username: true,
        displayName: true,
        role: true,
        status: true,
        email: true,
        phone: true,
        biography: true,
        lastLoginAt: true,
        createdAt: true,
      },
    })

    await writeOperationLog(tx, {
      actor,
      action: "admin.user.create",
      entityType: "user",
      entityId: created.userId,
      afterJson: {
        username: created.username,
        role: created.role,
        status: created.status,
        biography,
      },
    })

    return created
  })

  return {
    user: toManagedUser(user),
  }
}

export async function updateManagedUser(actor: ApiCurrentUser, userIdValue: string, input: ManagedUserInput) {
  ensureAdmin(actor)

  const userId = parseBigIntId(userIdValue, "用户 ID")
  const existing = await prisma.user.findUnique({
    where: {
      userId,
    },
    select: {
      userId: true,
      username: true,
      displayName: true,
      role: true,
      status: true,
      email: true,
      phone: true,
      biography: true,
      lastLoginAt: true,
      createdAt: true,
    },
  })

  if (!existing) {
    throw new ApiError({
      status: 404,
      code: "USER_NOT_FOUND",
      message: "用户不存在",
    })
  }

  const username = trimToNull(input.username) ?? existing.username
  const email = trimToNull(input.email) ?? existing.email
  const name = trimToNull(input.name) ?? existing.displayName ?? existing.username
  const biography = input.biography === undefined ? existing.biography : trimToNull(input.biography)
  const nextRole = input.role ?? existing.role

  const collision = await prisma.user.findFirst({
    where: {
      userId: {
        not: userId,
      },
      OR: [{ username }, { email }],
    },
    select: {
      userId: true,
    },
  })

  if (collision) {
    throw new ApiError({
      status: 409,
      code: "USER_EXISTS",
      message: "用户名或邮箱已存在",
    })
  }

  await assertManagedUserRoleChangeAllowed({
    userId,
    currentRole: existing.role,
    nextRole,
    status: existing.status,
  })

  const updated = await (async () => {
    try {
      return await prisma.$transaction(async (tx) => {
        const saved = await tx.user.update({
          where: {
            userId,
          },
          data: {
            username,
            email,
            role: nextRole,
            displayName: name,
            phone: input.phone === undefined ? existing.phone : trimToNull(input.phone),
            biography,
          },
          select: {
            userId: true,
            username: true,
            displayName: true,
            role: true,
            status: true,
            email: true,
            phone: true,
            biography: true,
            lastLoginAt: true,
            createdAt: true,
          },
        })

        await writeOperationLog(tx, {
          actor,
          action: "admin.user.update",
          entityType: "user",
          entityId: userId,
          beforeJson: {
            username: existing.username,
            role: existing.role,
            email: existing.email,
            phone: existing.phone,
            biography: existing.biography,
          },
          afterJson: {
            username: saved.username,
            role: saved.role,
            email: saved.email,
            phone: saved.phone,
            biography: saved.biography,
          },
        })

        return saved
      })
    } catch (error) {
      throw (
        translateUniqueConstraintError(error, [
          {
            constraintIncludes: ["username"],
            code: "USER_EXISTS",
            message: "用户名已存在",
          },
          {
            constraintIncludes: ["email"],
            code: "USER_EXISTS",
            message: "邮箱已存在",
          },
        ]) ?? error
      )
    }
  })()

  return {
    user: toManagedUser(updated),
  }
}

export async function toggleManagedUserStatus(actor: ApiCurrentUser, userIdValue: string) {
  ensureAdmin(actor)

  const userId = parseBigIntId(userIdValue, "用户 ID")
  const existing = await prisma.user.findUnique({
    where: {
      userId,
    },
    select: {
      userId: true,
      status: true,
      displayName: true,
      username: true,
      email: true,
      phone: true,
      biography: true,
      role: true,
      lastLoginAt: true,
      createdAt: true,
    },
  })

  if (!existing) {
    throw new ApiError({
      status: 404,
      code: "USER_NOT_FOUND",
      message: "用户不存在",
    })
  }

  if (!["active", "disabled"].includes(existing.status)) {
    throw new ApiError({
      status: 409,
      code: "INVALID_USER_STATUS",
      message: "只有正常或已禁用用户可以切换状态",
    })
  }

  const nextStatus: UserStatus = existing.status === "active" ? "disabled" : "active"

  // 管理员禁用自己会直接让当前治理入口失效，必须在服务层阻断。
  if (existing.userId === actor.userId && nextStatus === "disabled") {
    throw new ApiError({
      status: 409,
      code: "ADMIN_SELF_DISABLE_FORBIDDEN",
      message: "管理员不能禁用自己的账号",
    })
  }

  // 系统至少需要保留一个活动管理员，避免用户治理、审批和恢复操作全部失去执行者。
  if (existing.role === "admin" && nextStatus === "disabled") {
    const activeAdminTotal = await prisma.user.count({
      where: {
        role: "admin",
        status: "active",
      },
    })

    if (activeAdminTotal <= 1) {
      throw new ApiError({
        status: 409,
        code: "LAST_ADMIN_DISABLE_FORBIDDEN",
        message: "系统至少需要保留一个活动管理员",
      })
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.user.update({
      where: {
        userId,
      },
      data: {
        status: nextStatus,
      },
      select: {
        userId: true,
        username: true,
        displayName: true,
        role: true,
        status: true,
        email: true,
        phone: true,
        biography: true,
        lastLoginAt: true,
        createdAt: true,
      },
    })

    // 账号一旦被禁用，旧会话必须立即全部失效；
    // 否则浏览器里已经持有的 cookie 还能继续访问，禁用动作就没有真正收口权限。
    if (nextStatus === "disabled") {
      await revokeAllUserSessionsByUserId(userId, tx)
    }

    await writeOperationLog(tx, {
      actor,
      action: nextStatus === "disabled" ? "admin.user.disable" : "admin.user.enable",
      entityType: "user",
      entityId: userId,
      beforeJson: {
        status: existing.status,
      },
      afterJson: {
        status: nextStatus,
      },
      metadataJson: {
        sessionsRevoked: nextStatus === "disabled",
      },
    })

    await tx.notification.create({
      data: {
        recipientUserId: userId,
        type: nextStatus === "disabled" ? "user_disabled" : "user_enabled",
        messageKey: nextStatus === "disabled" ? "notifications.accountDisabled" : "notifications.accountEnabled",
        messageParams: {},
        title: nextStatus === "disabled" ? "账号已被禁用" : "账号已恢复启用",
        body: nextStatus === "disabled" ? "管理员已禁用你的账号。" : "管理员已重新启用你的账号。",
        entityType: "user",
        entityId: userId,
      },
    })

    return saved
  })

  return {
    user: toManagedUser(updated),
  }
}

export async function resetManagedUserPassword(actor: ApiCurrentUser, userIdValue: string) {
  ensureAdmin(actor)

  const userId = parseBigIntId(userIdValue, "用户 ID")
  const user = await prisma.user.findUnique({
    where: {
      userId,
    },
    select: {
      userId: true,
    },
  })

  if (!user) {
    throw new ApiError({
      status: 404,
      code: "USER_NOT_FOUND",
      message: "用户不存在",
    })
  }

  const tempPassword = randomBytes(8).toString("hex")
  const passwordHash = await bcrypt.hash(tempPassword, 10)

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: {
        userId,
      },
      data: {
        passwordHash,
        // 管理员下发的是一次性临时密码；
        // 用户下次登录后必须先完成自助改密，避免长期继续使用临时口令。
        passwordResetRequired: true,
      },
    })

    // 重置密码属于高风险治理动作，必须同步吊销用户所有旧会话，
    // 否则旧登录态仍然有效，管理员下发的临时密码就失去控制意义。
    await revokeAllUserSessionsByUserId(userId, tx)

    await writeOperationLog(tx, {
      actor,
      action: "admin.user.reset_password",
      entityType: "user",
      entityId: userId,
      afterJson: {
        reset: true,
      },
      metadataJson: {
        sessionsRevoked: true,
      },
    })
  })

  return {
    temporaryPassword: tempPassword,
  }
}

export async function listApprovalRequests(actor: ApiCurrentUser) {
  ensureAdmin(actor)

  const users = await prisma.user.findMany({
    where: {
      status: {
        in: ["pending", "rejected"],
      },
    },
    select: {
      userId: true,
      username: true,
      displayName: true,
      email: true,
      phone: true,
      biography: true,
      createdAt: true,
      status: true,
      rejectedReason: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  })

  return {
    requests: users.map(toApprovalRequest),
  }
}

export async function approveApprovalRequest(actor: ApiCurrentUser, userIdValue: string) {
  ensureAdmin(actor)

  const userId = parseBigIntId(userIdValue, "用户 ID")
  const now = new Date()
  const existing = await prisma.user.findUnique({
    where: {
      userId,
    },
    select: {
      userId: true,
      status: true,
      role: true,
      username: true,
    },
  })

  if (!existing) {
    throw new ApiError({
      status: 404,
      code: "USER_NOT_FOUND",
      message: "申请不存在",
    })
  }

  if (existing.status !== "pending" && existing.status !== "rejected") {
    throw new ApiError({
      status: 409,
      code: "APPROVAL_ALREADY_HANDLED",
      message: "该申请已处理",
    })
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: {
        userId,
      },
      data: {
        // 审批通过时统一回收为 author，确保历史脏数据和越权注册请求都无法借审批完成提权。
        role: "author",
        status: "active",
        approvedBy: actor.userId,
        approvedAt: now,
        rejectedReason: null,
      },
    })

    await tx.todoItem.updateMany(closeRegisterApprovalTodosQuery(userId, now))

    await tx.notification.create({
      data: {
        recipientUserId: userId,
        type: "register_approved",
        messageKey: "notifications.approvalAccepted",
        messageParams: {},
        title: "注册申请已通过",
        body: "管理员已通过你的注册申请，你现在可以登录平台。",
        entityType: "user",
        entityId: userId,
      },
    })

    await writeOperationLog(tx, {
      actor,
      action: "admin.approval.approve",
      entityType: "user",
      entityId: userId,
      beforeJson: {
        role: existing.role,
        status: existing.status,
      },
      afterJson: {
        role: "author",
        status: "active",
      },
    })
  })

  return { ok: true }
}

export async function rejectApprovalRequest(actor: ApiCurrentUser, userIdValue: string, input: ApprovalRejectInput) {
  ensureAdmin(actor)

  const userId = parseBigIntId(userIdValue, "用户 ID")
  const reason = trimToNull(input.reason)
  const now = new Date()

  if (!reason) {
    throw new ApiError({
      status: 400,
      code: "REJECT_REASON_REQUIRED",
      message: "请填写驳回原因",
    })
  }

  const existing = await prisma.user.findUnique({
    where: {
      userId,
    },
    select: {
      userId: true,
      status: true,
    },
  })

  if (!existing) {
    throw new ApiError({
      status: 404,
      code: "USER_NOT_FOUND",
      message: "申请不存在",
    })
  }

  if (existing.status !== "pending") {
    throw new ApiError({
      status: 409,
      code: "APPROVAL_ALREADY_HANDLED",
      message: "该申请不是待审批状态",
    })
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: {
        userId,
      },
      data: {
        status: "rejected",
        rejectedReason: reason,
      },
    })

    await tx.todoItem.updateMany(closeRegisterApprovalTodosQuery(userId, now))

    await tx.notification.create({
      data: {
        recipientUserId: userId,
        type: "register_rejected",
        messageKey: "notifications.approvalRejected",
        messageParams: {
          reason,
        },
        title: "注册申请未通过",
        body: `管理员驳回了你的注册申请：${reason}`,
        entityType: "user",
        entityId: userId,
      },
    })

    await writeOperationLog(tx, {
      actor,
      action: "admin.approval.reject",
      entityType: "user",
      entityId: userId,
      beforeJson: {
        status: existing.status,
      },
      afterJson: {
        status: "rejected",
      },
      metadataJson: {
        reason,
      },
    })
  })

  return { ok: true }
}

export async function listBindings(actor: ApiCurrentUser) {
  ensureAdmin(actor)

  const bindings = await prisma.editorAuthorBinding.findMany({
    where: {
      // 绑定管理页只展示当前仍然生效的关系；已解绑记录保留在数据库中用于审计，但不回流到列表。
      status: "active",
    },
    include: {
      editor: {
        select: {
          userId: true,
          username: true,
          displayName: true,
        },
      },
      author: {
        select: {
          userId: true,
          username: true,
          displayName: true,
        },
      },
      boundByUser: {
        select: {
          username: true,
          displayName: true,
        },
      },
    },
    orderBy: {
      boundAt: "desc",
    },
  })

  const [editors, authors] = await Promise.all([
    activeUserOptionsByRole("editor"),
    activeUserOptionsByRole("author"),
  ])

  const activeAuthorIds = new Set(
    bindings.filter((binding) => binding.status === "active").map((binding) => binding.author.userId.toString()),
  )

  return {
    bindings: bindings.map(toBinding),
    editors,
    // 业务规则要求“一个作者只能绑定给一个编辑”，因此新增绑定时作者下拉只展示当前尚未被占用的作者。
    authors: authors.filter((author) => !activeAuthorIds.has(author.id)),
  }
}

export async function createBinding(actor: ApiCurrentUser, input: BindingInput) {
  ensureAdmin(actor)

  const editorId = parseBigIntId(input.editorId, "编辑 ID")
  const authorId = parseBigIntId(input.authorId, "作者 ID")

  if (editorId === authorId) {
    throw new ApiError({
      status: 400,
      code: "INVALID_BINDING",
      message: "编辑和作者不能是同一人",
    })
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const editor = await ensureUserByRole(tx, editorId, "editor")
      const author = await ensureUserByRole(tx, authorId, "author")

      const active = await tx.editorAuthorBinding.findFirst({
        where: {
          editorId,
          authorId,
          status: "active",
        },
        select: {
          bindingId: true,
        },
      })

      if (active) {
        throw new ApiError({
          status: 409,
          code: "BINDING_EXISTS",
          message: "该绑定关系已存在",
        })
      }

      const authorActiveBinding = await tx.editorAuthorBinding.findFirst({
        where: {
          authorId,
          status: "active",
        },
        include: {
          editor: {
            select: {
              username: true,
              displayName: true,
            },
          },
        },
      })

      if (authorActiveBinding) {
        throw new ApiError({
          status: 409,
          code: "AUTHOR_ALREADY_BOUND",
          message: `作者已绑定给编辑 ${userName(authorActiveBinding.editor)}，请先解绑后再重新分配`,
        })
      }

      const binding = await tx.editorAuthorBinding.create({
        data: {
          editorId,
          authorId,
          status: "active",
          boundBy: actor.userId,
          // 活动绑定唯一键必须由应用层显式写入；
          // 只有这样数据库唯一约束才能真正兜住“同一作者只能有一条活动绑定”的规则。
          activePairKey: makeActiveBindingKey(editorId, authorId),
        },
        include: {
          editor: {
            select: {
              userId: true,
              username: true,
              displayName: true,
            },
          },
          author: {
            select: {
              userId: true,
              username: true,
              displayName: true,
            },
          },
          boundByUser: {
            select: {
              username: true,
              displayName: true,
            },
          },
        },
      })

      await tx.notification.createMany({
        data: [
          {
            recipientUserId: editorId,
            type: "binding_created",
            messageKey: "notifications.bindingEditor",
            messageParams: {
              authorName: userName(author),
            },
            title: "新增编辑-作者绑定",
            body: `管理员为你绑定了作者 ${userName(author)}。`,
            entityType: "editor_author_binding",
            entityId: binding.bindingId,
          },
          {
            recipientUserId: authorId,
            type: "binding_created",
            messageKey: "notifications.bindingAuthor",
            messageParams: {
              editorName: userName(editor),
            },
            title: "新增编辑-作者绑定",
            body: `管理员为你绑定了编辑 ${userName(editor)}。`,
            entityType: "editor_author_binding",
            entityId: binding.bindingId,
          },
        ],
      })

      await writeOperationLog(tx, {
        actor,
        action: "admin.binding.create",
        entityType: "editor_author_binding",
        entityId: binding.bindingId,
        afterJson: {
          editorId: editorId.toString(),
          authorId: authorId.toString(),
          status: "active",
        },
      })

      return binding
    })

    return {
      binding: toBinding(result),
    }
  } catch (error) {
    throw (
      translateUniqueConstraintError(error, [
        {
          constraintIncludes: ["active_pair_key"],
          code: "AUTHOR_ALREADY_BOUND",
          message: "该作者已存在活动绑定，请刷新列表后重试",
        },
      ]) ?? error
    )
  }
}

export async function unbind(actor: ApiCurrentUser, bindingIdValue: string) {
  ensureAdmin(actor)

  const bindingId = parseBigIntId(bindingIdValue, "绑定 ID")
  const binding = await prisma.editorAuthorBinding.findUnique({
    where: {
      bindingId,
    },
    include: {
      editor: {
        select: {
          userId: true,
          username: true,
          displayName: true,
        },
      },
      author: {
        select: {
          userId: true,
          username: true,
          displayName: true,
        },
      },
      boundByUser: {
        select: {
          username: true,
          displayName: true,
        },
      },
    },
  })

  if (!binding) {
    throw new ApiError({
      status: 404,
      code: "BINDING_NOT_FOUND",
      message: "绑定关系不存在",
    })
  }

  if (binding.status !== "active") {
    throw new ApiError({
      status: 409,
      code: "BINDING_ALREADY_INACTIVE",
      message: "该绑定关系已解绑",
    })
  }

  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.editorAuthorBinding.update({
      where: {
        bindingId,
      },
      data: {
        status: "inactive",
        unboundBy: actor.userId,
        unboundAt: new Date(),
        // 解绑后必须显式清空活动绑定唯一键，
        // 否则同一作者将永远无法再建立新的活动绑定。
        activePairKey: null,
      },
      include: {
        editor: {
          select: {
            userId: true,
            username: true,
            displayName: true,
          },
        },
        author: {
          select: {
            userId: true,
            username: true,
            displayName: true,
          },
        },
        boundByUser: {
          select: {
            username: true,
            displayName: true,
          },
        },
      },
    })

    await tx.notification.createMany({
      data: [
        {
          recipientUserId: binding.editorId,
          type: "binding_removed",
          messageKey: "notifications.unbindingEditor",
          messageParams: {
            authorName: userName(binding.author),
          },
          title: "编辑-作者绑定已解绑",
          body: `管理员解除了你与作者 ${userName(binding.author)} 的绑定。`,
          entityType: "editor_author_binding",
          entityId: bindingId,
        },
        {
          recipientUserId: binding.authorId,
          type: "binding_removed",
          messageKey: "notifications.unbindingAuthor",
          messageParams: {
            editorName: userName(binding.editor),
          },
          title: "编辑-作者绑定已解绑",
          body: `管理员解除了你与编辑 ${userName(binding.editor)} 的绑定。`,
          entityType: "editor_author_binding",
          entityId: bindingId,
        },
      ],
    })

    await writeOperationLog(tx, {
      actor,
      action: "admin.binding.unbind",
      entityType: "editor_author_binding",
      entityId: bindingId,
      beforeJson: {
        status: binding.status,
      },
      afterJson: {
        status: "inactive",
      },
    })

    return saved
  })

  return {
    binding: toBinding(updated),
  }
}

export async function listSiMainTypeParams(actor: ApiCurrentUser) {
  ensureAdmin(actor)

  const items = await prisma.siMainType.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  })

  return {
    items: items.map(toSysParam),
  }
}

export async function createSiMainTypeParam(actor: ApiCurrentUser, input: SiMainTypeInput) {
  ensureAdmin(actor)

  const name = trimToNull(input.name)
  const value = trimToNull(input.value)

  if (!name || !value) {
    throw new ApiError({
      status: 400,
      code: "INVALID_INPUT",
      message: "请完整填写参数名称和值",
    })
  }

  const item = await prisma.$transaction(async (tx) => {
    const existing = await tx.siMainType.findFirst({
      where: {
        OR: [{ name }, { code: value }],
      },
      select: {
        mainTypeId: true,
      },
    })

    if (existing) {
      throw new ApiError({
        status: 409,
        code: "PARAM_EXISTS",
        message: "主类型名称或参数值已存在",
      })
    }

    const created = await tx.siMainType.create({
      data: {
        name,
        code: value,
        sortOrder: input.order ?? 0,
        isActive: input.status !== "inactive",
      },
    })

    await writeOperationLog(tx, {
      actor,
      action: "admin.param.si_main_type.create",
      entityType: "si_main_type",
      entityId: created.mainTypeId,
      afterJson: {
        name: created.name,
        code: created.code,
        isActive: created.isActive,
      },
    })

    return created
  })

  return {
    item: toSysParam(item),
  }
}

export async function updateSiMainTypeParam(actor: ApiCurrentUser, mainTypeIdValue: string, input: SiMainTypeInput) {
  ensureAdmin(actor)

  const mainTypeId = parseBigIntId(mainTypeIdValue, "主类型 ID")
  const existing = await prisma.siMainType.findUnique({
    where: {
      mainTypeId,
    },
  })

  if (!existing) {
    throw new ApiError({
      status: 404,
      code: "PARAM_NOT_FOUND",
      message: "主类型不存在",
    })
  }

  const name = trimToNull(input.name) ?? existing.name
  const value = trimToNull(input.value) ?? existing.code

  const collision = await prisma.siMainType.findFirst({
    where: {
      mainTypeId: {
        not: mainTypeId,
      },
      OR: [{ name }, { code: value }],
    },
    select: {
      mainTypeId: true,
    },
  })

  if (collision) {
    throw new ApiError({
      status: 409,
      code: "PARAM_EXISTS",
      message: "主类型名称或参数值已存在",
    })
  }

  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.siMainType.update({
      where: {
        mainTypeId,
      },
      data: {
        name,
        code: value,
        sortOrder: input.order ?? existing.sortOrder,
        isActive: input.status ? input.status === "active" : existing.isActive,
      },
    })

    await writeOperationLog(tx, {
      actor,
      action: "admin.param.si_main_type.update",
      entityType: "si_main_type",
      entityId: mainTypeId,
      beforeJson: {
        name: existing.name,
        code: existing.code,
        isActive: existing.isActive,
      },
      afterJson: {
        name: saved.name,
        code: saved.code,
        isActive: saved.isActive,
      },
    })

    return saved
  })

  return {
    item: toSysParam(updated),
  }
}

export async function listStagePlanDefaults(actor: ApiCurrentUser) {
  ensureAdmin(actor)

  const items = await prisma.stagePlanDefault.findMany({
    orderBy: {
      stageCode: "asc",
    },
  })

  const byCode = new Map(items.map((item) => [item.stageCode, item]))

  const result: StagePlanDefaultItem[] = stageOrder.map((stage) => {
    const record = byCode.get(paramStageToStageCode(stage))

    return {
      stage,
      label: stageLabelMap[stage],
      days: record?.defaultPlanDays ?? 0,
      warningDaysBeforeDue: record?.warningDaysBeforeDue ?? 1,
      updatedAt: record?.updatedAt.toISOString() ?? "",
    }
  })

  return {
    items: result,
  }
}

export async function updateStagePlanDefaults(actor: ApiCurrentUser, input: StagePlanDefaultsInput) {
  ensureAdmin(actor)

  await prisma.$transaction(async (tx) => {
    for (const item of input.items) {
      if (item.days <= 0) {
        throw new ApiError({
          status: 400,
          code: "INVALID_DAYS",
          message: "计划天数必须大于 0",
        })
      }

      await tx.stagePlanDefault.upsert({
        where: {
          stageCode: paramStageToStageCode(item.stage),
        },
        update: {
          defaultPlanDays: item.days,
          warningDaysBeforeDue: item.warningDaysBeforeDue ?? 1,
          updatedBy: actor.userId,
        },
        create: {
          stageCode: paramStageToStageCode(item.stage),
          defaultPlanDays: item.days,
          warningDaysBeforeDue: item.warningDaysBeforeDue ?? 1,
          updatedBy: actor.userId,
        },
      })
    }

    await writeOperationLog(tx, {
      actor,
      action: "admin.param.stage_plan_defaults.update",
      entityType: "stage_plan_defaults",
      entityId: BigInt(0),
      afterJson: {
        items: input.items,
      },
    })
  })

  return listStagePlanDefaults(actor)
}

export async function listAuditLogs(actor: ApiCurrentUser, filters: AuditFilters = {}) {
  ensureAdmin(actor)

  const keyword = trimToNull(filters.keyword)
  const action = trimToNull(filters.action)

  const logs = await prisma.operationLog.findMany({
    where: {
      ...(action && action !== "all" ? { action } : {}),
      ...(keyword
        ? {
            OR: [
              {
                actor: {
                  displayName: {
                    contains: keyword,
                  },
                },
              },
              {
                actor: {
                  username: {
                    contains: keyword,
                  },
                },
              },
              {
                project: {
                  title: {
                    contains: keyword,
                  },
                },
              },
              {
                storyIdea: {
                  title: {
                    contains: keyword,
                  },
                },
              },
              {
                doc: {
                  title: {
                    contains: keyword,
                  },
                },
              },
            ],
          }
        : {}),
    },
    include: {
      actor: {
        select: {
          username: true,
          displayName: true,
          role: true,
        },
      },
      project: {
        select: {
          title: true,
        },
      },
      doc: {
        select: {
          title: true,
        },
      },
      storyIdea: {
        select: {
          title: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 200,
  })

  return {
    logs: logs.map(toAuditLog),
    actions: Array.from(new Set(logs.map((item) => item.action))),
  }
}

export async function listGovernanceProjects(actor: ApiCurrentUser, filters: ProjectFilters = {}) {
  ensureAdmin(actor)
  const keyword = trimToNull(filters.keyword)
  const stage = trimToNull(filters.stage)
  const lifecycle = trimToNull(filters.lifecycle)
  const editorId = filters.editorId && filters.editorId !== "all" ? parseBigIntId(filters.editorId, "编辑 ID") : null
  const authorId = filters.authorId && filters.authorId !== "all" ? parseBigIntId(filters.authorId, "作者 ID") : null
  const overdue = trimToNull(filters.overdue)
  const pagination = parsePagination(filters)

  // 管理员列表可能覆盖全库项目，必须让数据库完成筛选、排序和分页，前端只展示当前页。
  const where: Prisma.ProjectWhereInput = {
    ...(keyword
      ? {
          OR: [
            { title: { contains: keyword } },
            { sourceSi: { title: { contains: keyword } } },
          ],
        }
      : {}),
    ...(lifecycle && lifecycle !== "all"
      ? { lifecycleStatus: lifecycle as Prisma.ProjectWhereInput["lifecycleStatus"] }
      : {}),
    ...(overdue === "yes" && (!lifecycle || lifecycle === "all") ? { lifecycleStatus: "active" } : {}),
    ...(editorId ? { editorId } : {}),
    ...(authorId ? { authorId } : {}),
    ...(stage && stage !== "all"
      ? {
          currentStage:
            stage === "completed"
              ? "completed"
              : (uiStageToStageCode[stage as Exclude<ProjectStage, "completed">] as Prisma.ProjectWhereInput["currentStage"]),
        }
      : {}),
    ...(overdue === "yes"
      ? {
          stagePlans: {
            some: {
              timelineStatus: "overdue",
            },
          },
        }
      : overdue === "no"
        ? {
            stagePlans: {
              none: {
                timelineStatus: "overdue",
              },
            },
          }
        : {}),
  }

  const [projects, total, editors, authors] = await Promise.all([
    prisma.project.findMany({
      where,
      include: projectInclude,
      orderBy: {
        updatedAt: "desc",
      },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.project.count({ where }),
    activeUserOptionsByRole("editor"),
    activeUserOptionsByRole("author"),
  ])

  return {
    items: projects.map(toProjectItem),
    ...makePaginationMeta(total, pagination),
    editors,
    authors,
  }
}

export async function getGovernanceProjectDetail(actor: ApiCurrentUser, projectIdValue: string) {
  ensureAdmin(actor)
  const projectId = parseBigIntId(projectIdValue, "项目 ID")
  const project = await prisma.project.findUnique({
    where: {
      projectId,
    },
    include: projectInclude,
  })

  if (!project) {
    throw new ApiError({
      status: 404,
      code: "PROJECT_NOT_FOUND",
      message: "项目不存在",
    })
  }

  const [editors, authors] = await Promise.all([
    activeUserOptionsByRole("editor"),
    activeUserOptionsByRole("author"),
  ])

  return {
    project: toGovernanceProjectDetail(project),
    editors,
    authors,
  }
}

export async function updateGovernanceProjectAssignment(
  actor: ApiCurrentUser,
  projectIdValue: string,
  input: ProjectAssignmentInput,
) {
  ensureAdmin(actor)

  const projectId = parseBigIntId(projectIdValue, "项目 ID")

  const project = await prisma.project.findUnique({
    where: {
      projectId,
    },
    include: {
      editor: {
        select: {
          username: true,
          displayName: true,
        },
      },
      author: {
        select: {
          username: true,
          displayName: true,
        },
      },
    },
  })

  if (!project) {
    throw new ApiError({
      status: 404,
      code: "PROJECT_NOT_FOUND",
      message: "项目不存在",
    })
  }

  const nextEditorId = input.editorId ? parseBigIntId(input.editorId, "编辑 ID") : project.editorId
  const nextAuthorId = input.authorId ? parseBigIntId(input.authorId, "作者 ID") : project.authorId

  if (nextEditorId === project.editorId && nextAuthorId === project.authorId) {
    return getGovernanceProjectDetail(actor, projectId.toString())
  }

  await prisma.$transaction(async (tx) => {
    const nextEditor = await ensureUserByRole(tx, nextEditorId, "editor")
    const nextAuthor = await ensureUserByRole(tx, nextAuthorId, "author")
    const activeBinding = await tx.editorAuthorBinding.findFirst({
      where: {
        editorId: nextEditorId,
        authorId: nextAuthorId,
        status: "active",
      },
      select: {
        bindingId: true,
      },
    })

    if (!activeBinding) {
      throw new ApiError({
        status: 409,
        code: "PROJECT_ASSIGNMENT_BINDING_REQUIRED",
        message: "调整项目归属前，目标编辑与作者必须先建立有效绑定关系",
      })
    }

      await tx.project.update({
        where: {
          projectId,
        },
        data: {
          editorId: nextEditorId,
          authorId: nextAuthorId,
        },
      })

      if (nextAuthorId !== project.authorId) {
        // 项目作者变更后，仍处于作者持有中的活动草稿必须同步迁给新作者；
        // 否则新作者能看到项目，却会被 Doc 编辑权限拦在 activeDraft.ownerUserId 上。
        await tx.docCurrentDraft.updateMany({
          where: {
            status: "active",
            ownerRole: "author",
            doc: {
              projectId,
            },
          },
          data: {
            ownerUserId: nextAuthorId,
          },
        })

        await tx.todoItem.updateMany({
          where: {
            projectId,
            status: "open",
            todoType: "doc_return",
            recipientUserId: project.authorId,
          },
          data: {
            recipientUserId: nextAuthorId,
          },
        })
      }

      if (nextEditorId !== project.editorId) {
        // 编辑变更同样要迁移编辑持有中的审稿草稿和待审待办，
        // 避免旧编辑离开后，新编辑无法继续 review 当前流转中的稿件。
        await tx.docCurrentDraft.updateMany({
          where: {
            status: "active",
            ownerRole: "editor",
            doc: {
              projectId,
            },
          },
          data: {
            ownerUserId: nextEditorId,
          },
        })

        await tx.todoItem.updateMany({
          where: {
            projectId,
            status: "open",
            todoType: "doc_review",
            recipientUserId: project.editorId,
          },
          data: {
            recipientUserId: nextEditorId,
          },
        })
      }

	    await tx.projectAssignmentLog.create({
      data: {
        projectId,
        oldEditorId: project.editorId,
        newEditorId: nextEditorId,
        oldAuthorId: project.authorId,
        newAuthorId: nextAuthorId,
        changedBy: actor.userId,
        reason: trimToNull(input.reason),
      },
    })

    await tx.notification.createMany({
      data: [
        {
          recipientUserId: nextEditorId,
          type: "project_assignment_changed",
          messageKey: "notifications.projectAssignment",
          messageParams: {
            projectTitle: project.title,
          },
          title: "项目归属已调整",
          body: `管理员将项目《${project.title}》分配给你负责。`,
          projectId,
          entityType: "project",
          entityId: projectId,
        },
        {
          recipientUserId: nextAuthorId,
          type: "project_assignment_changed",
          messageKey: "notifications.projectAssignmentMember",
          messageParams: {
            projectTitle: project.title,
          },
          title: "项目归属已调整",
          body: `管理员已调整项目《${project.title}》的协作归属。`,
          projectId,
          entityType: "project",
          entityId: projectId,
        },
      ],
    })

    await writeOperationLog(tx, {
      actor,
      action: "admin.project.assignment.update",
      entityType: "project",
      entityId: projectId,
      projectId,
      beforeJson: {
        editorId: project.editorId.toString(),
        authorId: project.authorId.toString(),
      },
      afterJson: {
        editorId: nextEditor.userId.toString(),
        authorId: nextAuthor.userId.toString(),
      },
      metadataJson: {
        reason: trimToNull(input.reason),
      },
    })
  })

  return getGovernanceProjectDetail(actor, projectId.toString())
}

export async function updateGovernanceProjectStagePlans(
  actor: ApiCurrentUser,
  projectIdValue: string,
  input: ProjectStagePlansInput,
) {
  ensureAdmin(actor)

  const projectId = parseBigIntId(projectIdValue, "项目 ID")
  const project = await prisma.project.findUnique({
    where: {
      projectId,
    },
    select: {
      projectId: true,
    },
  })

  if (!project) {
    throw new ApiError({
      status: 404,
      code: "PROJECT_NOT_FOUND",
      message: "项目不存在",
    })
  }

  await prisma.$transaction(async (tx) => {
    for (const item of input.items) {
      if (item.planDays <= 0) {
        throw new ApiError({
          status: 400,
          code: "INVALID_PLAN_DAYS",
          message: "计划天数必须大于 0",
        })
      }

      const stagePlan = await tx.projectStagePlan.findFirst({
        where: {
          projectId,
          stageCode: uiStageToStageCode[item.stage],
        },
      })

      if (!stagePlan) {
        continue
      }

      await tx.projectStagePlan.update({
        where: {
          stagePlanId: stagePlan.stagePlanId,
        },
        data: {
          planDays: item.planDays,
          dueAt: stagePlan.startedAt
            ? new Date(stagePlan.startedAt.getTime() + item.planDays * 24 * 60 * 60 * 1000)
            : stagePlan.dueAt,
        },
      })
    }

    await writeOperationLog(tx, {
      actor,
      action: "admin.project.stage_plans.update",
      entityType: "project",
      entityId: projectId,
      projectId,
      afterJson: {
        items: input.items,
      },
    })
  })

  return getGovernanceProjectDetail(actor, projectId.toString())
}

export async function transitionGovernanceProject(
  actor: ApiCurrentUser,
  projectIdValue: string,
  action: ProjectTransitionAction,
) {
  ensureAdmin(actor)

  const projectId = parseBigIntId(projectIdValue, "项目 ID")
  const project = await prisma.project.findUnique({
    where: {
      projectId,
    },
    select: {
      projectId: true,
      title: true,
      lifecycleStatus: true,
      currentStage: true,
      releaseStatus: true,
    },
  })

  if (!project) {
    throw new ApiError({
      status: 404,
      code: "PROJECT_NOT_FOUND",
      message: "项目不存在",
    })
  }

  if (!PROJECT_TRANSITION_MATRIX[action].includes(project.lifecycleStatus)) {
    throw new ApiError({
      status: 409,
      code: "PROJECT_TRANSITION_FORBIDDEN",
      message: "当前项目生命周期不允许执行该操作",
    })
  }

  if (action === "complete" && project.releaseStatus !== "approved") {
    throw new ApiError({
      status: 409,
      code: "PROJECT_CANNOT_COMPLETE",
      message: "质检未通过，不能标记项目完成",
    })
  }

  const now = new Date()
  let restoredStage: "synopsis" | "outline" | "chapter" | "release" | null = null

  await prisma.$transaction(async (tx) => {
    if (action === "complete") {
      await tx.project.update({
        where: {
          projectId,
        },
        data: {
          lifecycleStatus: "completed",
          currentStage: "completed",
          completedAt: now,
        },
      })
    } else if (action === "archive") {
      await tx.project.update({
        where: {
          projectId,
        },
        data: {
          lifecycleStatus: "archived",
          archivedAt: now,
        },
      })
    } else if (action === "cancel") {
      await tx.project.update({
        where: {
          projectId,
        },
        data: {
          lifecycleStatus: "cancelled",
          cancelledAt: now,
        },
      })
	    } else {
	      const restorableProject = await tx.project.findUnique({
        where: {
          projectId,
        },
        include: {
          docs: {
            where: {
              isDeleted: false,
            },
            include: {
              finalRevision: {
                select: {
                  revisionId: true,
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
                },
              },
              latestRevision: {
                select: {
                  revisionId: true,
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
                },
              },
            },
            orderBy: [{ stageCode: "asc" }, { sortOrder: "asc" }, { chapterNo: "asc" }],
          },
        },
      })

      if (!restorableProject) {
        throw new ApiError({
          status: 404,
          code: "PROJECT_NOT_FOUND",
          message: "项目不存在",
        })
      }

      const synopsisDoc = restorableProject.docs.find((doc) => doc.docType === "synopsis")
      const outlineDoc = restorableProject.docs.find((doc) => doc.docType === "outline")
      const chapterDocs = restorableProject.docs.filter((doc) => doc.docType === "chapter")
      const releaseDoc = restorableProject.docs.find((doc) => doc.docType === "release")
      const nextStage = stageByProjectDocs({
        releaseStatus: restorableProject.releaseStatus,
        hasOutlineDoc: Boolean(outlineDoc),
        hasChapterDoc: chapterDocs.length > 0,
        hasReleaseDoc: Boolean(releaseDoc),
        synopsisApproved: synopsisDoc?.status === "approved",
        outlineApproved: outlineDoc?.status === "approved",
      })
      restoredStage = nextStage

      for (const doc of restorableProject.docs) {
        await ensureActiveDraftForRestore(tx, {
          doc: {
            docId: doc.docId,
            docType: doc.docType,
            title: doc.title,
            status: doc.status,
            chapterNo: doc.chapterNo,
            activeDraftId: doc.activeDraftId,
            currentWordCount: doc.currentWordCount,
            currentPlainText: doc.currentPlainText,
            currentCleanText: doc.currentCleanText,
            summary: doc.summary,
            projectId: restorableProject.projectId,
            projectAuthorId: restorableProject.authorId,
            projectEditorId: restorableProject.editorId,
            finalRevision: doc.finalRevision,
            latestRevision: doc.latestRevision,
          },
          reopenApprovedReleaseDoc: doc.docType === "release" && nextStage === "release" && doc.status === "approved",
        })
      }

      await tx.project.update({
        where: {
          projectId,
        },
        data: {
          lifecycleStatus: "active",
          currentStage: nextStage,
          releaseStatus:
            nextStage === "release"
              ? releaseDoc?.status === "approved"
                ? "unlocked"
                : restorableProject.releaseStatus === "locked"
                  ? "unlocked"
                  : restorableProject.releaseStatus
              : "locked",
          completedAt: null,
          archivedAt: null,
          cancelledAt: null,
          restoredAt: now,
        },
      })
    }

    if (action !== "restore") {
      // 项目完成、归档或取消后，所有打开待办都应同步关闭；
      // 否则已结束项目仍会污染工作台和通知待处理入口。
      await tx.todoItem.updateMany({
        where: {
          projectId,
          status: "open",
        },
        data: {
          status: "cancelled",
          cancelledAt: now,
          openDedupeKey: null,
        },
      })
    }

    await writeOperationLog(tx, {
      actor,
      action: `admin.project.${action}`,
      entityType: "project",
      entityId: projectId,
      projectId,
      beforeJson: {
        lifecycleStatus: project.lifecycleStatus,
        currentStage: project.currentStage,
      },
      afterJson: {
        lifecycleStatus: action === "complete" ? "completed" : action === "restore" ? "active" : action,
        currentStage:
          action === "complete"
            ? "completed"
            : action === "restore"
              ? restoredStage ?? project.currentStage
              : project.currentStage,
      },
    })
  })

  return getGovernanceProjectDetail(actor, projectId.toString())
}

export async function downloadGovernanceProjectFinal(actor: ApiCurrentUser, projectIdValue: string) {
  ensureAdmin(actor)
  const projectId = parseBigIntId(projectIdValue, "项目 ID")
  const project = await prisma.project.findUnique({
    where: {
      projectId,
    },
    include: {
      docs: {
        where: {
          isDeleted: false,
          docType: "release",
        },
        include: {
          finalRevision: true,
        },
      },
    },
  })

  if (!project) {
    throw new ApiError({
      status: 404,
      code: "PROJECT_NOT_FOUND",
      message: "项目不存在",
    })
  }

  const releaseDoc = project.docs[0]
  const finalText =
    releaseDoc?.finalRevision?.exportText ??
    releaseDoc?.finalRevision?.cleanText ??
    releaseDoc?.finalRevision?.plainText ??
    ""
  const finalRevisionContentJson = releaseDoc?.finalRevision?.contentJson
  const finalContentJson = isNovelDocV1(finalRevisionContentJson) ? finalRevisionContentJson : null

  if (!finalText.trim()) {
    throw new ApiError({
      status: 409,
      code: "FINAL_TEXT_NOT_READY",
      message: "当前项目还没有可下载的终稿内容",
    })
  }

  return {
    filename: `${project.title}.docx`,
    content: await buildDocxBuffer({
      title: project.title,
      sections: [
        {
          title: "终稿",
          body: finalText,
          contentJson: finalContentJson,
        },
      ],
    }),
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }
}
