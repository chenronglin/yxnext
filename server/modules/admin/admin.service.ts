import "server-only"

import { randomBytes } from "crypto"

import bcrypt from "bcryptjs"
import { Prisma } from "@prisma/client"

import { prisma } from "@/server/db/prisma"
import { ApiError } from "@/server/shared/api-response"
import { assertRole } from "@/server/shared/current-user"
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
  QcStatus,
  StagePlan,
} from "@/types/project"

type TxClient = Prisma.TransactionClient

type ManagedUserInput = {
  username?: string
  name?: string
  role?: Role
  email?: string
  phone?: string | null
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
    stage: "synopsis" | "outline" | "manuscript" | "qc"
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
    stage: "synopsis" | "outline" | "manuscript" | "qc"
    planDays: number
  }>
}

type ProjectTransitionAction = "complete" | "archive" | "cancel" | "restore"

type ProjectFilters = {
  keyword?: string | null
  stage?: string | null
  lifecycle?: string | null
  editorId?: string | null
  authorId?: string | null
  overdue?: string | null
}

type AuditFilters = {
  keyword?: string | null
  action?: string | null
}

type RangeKey = "7d" | "30d" | "90d" | "all"
type EditableProjectStage = Exclude<ProjectStage, "done">

const stageCodeToUiStage: Record<"synopsis" | "outline" | "chapter" | "release", ProjectStage> = {
  synopsis: "synopsis",
  outline: "outline",
  chapter: "manuscript",
  release: "qc",
}

const uiStageToStageCode: Record<Exclude<ProjectStage, "done">, "synopsis" | "outline" | "chapter" | "release"> = {
  synopsis: "synopsis",
  outline: "outline",
  manuscript: "chapter",
  qc: "release",
}

const stageOrder: Array<Exclude<ProjectStage, "done">> = ["synopsis", "outline", "manuscript", "qc"]

const stageLabelMap: Record<Exclude<ProjectStage, "done">, string> = {
  synopsis: "梗概",
  outline: "细纲",
  manuscript: "正文",
  qc: "全文质检",
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

function userContact(user: { email: string; phone: string | null }) {
  return user.phone?.trim() ? `${user.phone} / ${user.email}` : user.email
}

function dbDocStatusToUiStatus(status: "draft" | "submitted" | "rejected" | "approved") {
  return status === "rejected" ? "returned" : status
}

function dbProjectStageToUiStage(stage: "synopsis" | "outline" | "chapter" | "release" | "completed"): ProjectStage {
  if (stage === "completed") {
    return "done"
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
  if (stage === "manuscript") return "细纲通过后开始"
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
    note: "—",
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
  if (stageCode === "chapter") return "manuscript"
  if (stageCode === "release") return "qc"
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

function projectQcStatus(project: ProjectRecord): QcStatus {
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
  const qcStatus = projectQcStatus(project)

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
      title: "全文质检 Doc",
      statusLabel:
        qcStatus === "locked"
          ? "未解锁"
          : qcStatus === "unlocked"
            ? "已解锁"
            : qcStatus === "draft"
              ? "草稿"
              : qcStatus === "submitted"
                ? "已提交待审"
                : qcStatus === "returned"
                  ? "退回待改"
                  : "审核通过",
      tone:
        qcStatus === "approved"
          ? "success"
          : qcStatus === "returned"
            ? "warning"
            : qcStatus === "submitted" || qcStatus === "unlocked"
              ? "info"
              : "neutral",
    },
  ]
}

function toProjectItem(project: ProjectRecord): ProjectItem {
  const stage = dbProjectStageToUiStage(project.currentStage)
  const stagePlans = project.stagePlans.map(toStagePlan)
  const currentPlan = stage === "done" ? null : stagePlans.find((item) => item.stage === stage)
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
    planStatus: stage === "done" ? "completed" : currentPlan?.status ?? "not_started",
    pendingDocs: project.docs.filter((doc) => doc.status !== "approved").length,
    overdue: project.stagePlans.some((plan) => plan.timelineStatus === "overdue"),
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    finishedAt: formatDateTime(project.completedAt),
    qcStatus: projectQcStatus(project),
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
      { stage: "manuscript", count: stageCountMap.get("manuscript") ?? 0 },
      { stage: "qc", count: stageCountMap.get("qc") ?? 0 },
      { stage: "done", count: stageCountMap.get("done") ?? 0 },
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
      label: item.stage === "done" ? "完成" : stageLabelMap[item.stage],
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
      },
      select: {
        userId: true,
        username: true,
        displayName: true,
        role: true,
        status: true,
        email: true,
        phone: true,
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

  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.user.update({
      where: {
        userId,
      },
      data: {
        username,
        email,
        role: input.role ?? existing.role,
        displayName: name,
        phone: input.phone === undefined ? existing.phone : trimToNull(input.phone),
      },
      select: {
        userId: true,
        username: true,
        displayName: true,
        role: true,
        status: true,
        email: true,
        phone: true,
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
      },
      afterJson: {
        username: saved.username,
        role: saved.role,
        email: saved.email,
        phone: saved.phone,
      },
    })

    return saved
  })

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
        lastLoginAt: true,
        createdAt: true,
      },
    })

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
    })

    await tx.notification.create({
      data: {
        recipientUserId: userId,
        type: nextStatus === "disabled" ? "user_disabled" : "user_enabled",
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

  const tempPassword = randomBytes(5).toString("hex")
  const passwordHash = await bcrypt.hash(tempPassword, 10)

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: {
        userId,
      },
      data: {
        passwordHash,
      },
    })

    await writeOperationLog(tx, {
      actor,
      action: "admin.user.reset_password",
      entityType: "user",
      entityId: userId,
      afterJson: {
        reset: true,
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
        status: "active",
        approvedBy: actor.userId,
        approvedAt: new Date(),
        rejectedReason: null,
      },
    })

    await tx.notification.create({
      data: {
        recipientUserId: userId,
        type: "register_approved",
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
        status: existing.status,
      },
      afterJson: {
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

    await tx.notification.create({
      data: {
        recipientUserId: userId,
        type: "register_rejected",
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
        // active_pair_key 在现网库里是 GENERATED ALWAYS 列，这里只写业务字段，交给数据库自动计算。
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
          title: "新增编辑-作者绑定",
          body: `管理员为你绑定了作者 ${userName(author)}。`,
          entityType: "editor_author_binding",
          entityId: binding.bindingId,
        },
        {
          recipientUserId: authorId,
          type: "binding_created",
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
        // active_pair_key 会随着 status 变成 inactive 自动回落为 NULL，无需应用层手动赋值。
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
          title: "编辑-作者绑定已解绑",
          body: `管理员解除了你与作者 ${userName(binding.author)} 的绑定。`,
          entityType: "editor_author_binding",
          entityId: bindingId,
        },
        {
          recipientUserId: binding.authorId,
          type: "binding_removed",
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

  const projects = await prisma.project.findMany({
    where: {
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
      ...(editorId ? { editorId } : {}),
      ...(authorId ? { authorId } : {}),
      ...(stage && stage !== "all"
        ? {
            currentStage:
              stage === "done"
                ? "completed"
                : (uiStageToStageCode[stage as Exclude<ProjectStage, "done">] as Prisma.ProjectWhereInput["currentStage"]),
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
    },
    include: projectInclude,
    orderBy: {
      updatedAt: "desc",
    },
  })

  const [editors, authors] = await Promise.all([
    activeUserOptionsByRole("editor"),
    activeUserOptionsByRole("author"),
  ])

  return {
    items: projects.map(toProjectItem),
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

    await tx.project.update({
      where: {
        projectId,
      },
      data: {
        editorId: nextEditorId,
        authorId: nextAuthorId,
      },
    })

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
          title: "项目归属已调整",
          body: `管理员将项目《${project.title}》分配给你负责。`,
          projectId,
          entityType: "project",
          entityId: projectId,
        },
        {
          recipientUserId: nextAuthorId,
          type: "project_assignment_changed",
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

  if (action === "complete" && project.releaseStatus !== "approved") {
    throw new ApiError({
      status: 409,
      code: "PROJECT_CANNOT_COMPLETE",
      message: "全文质检未通过，不能标记项目完成",
    })
  }

  const now = new Date()

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
      await tx.project.update({
        where: {
          projectId,
        },
        data: {
          lifecycleStatus: "active",
          restoredAt: now,
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
        currentStage: action === "complete" ? "completed" : project.currentStage,
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

  if (!finalText.trim()) {
    throw new ApiError({
      status: 409,
      code: "FINAL_TEXT_NOT_READY",
      message: "当前项目还没有可下载的终稿内容",
    })
  }

  return {
    filename: `${project.title}.md`,
    content: finalText,
  }
}
