import "server-only"

import { Prisma } from "@prisma/client"

import { prisma } from "@/server/db/prisma"
import { ApiError } from "@/server/shared/api-response"
import {
  makeActiveDocKey,
  makeChapterNoKey,
  makeChapterOrderKey,
  makeSingleDocKey,
  translateUniqueConstraintError,
} from "@/server/shared/invariant-keys"
import { syncActiveProjectTimelineStatuses } from "@/server/shared/project-stage-timeline"
import { buildDocxBuffer } from "@/server/shared/docx-export"
import { createNovelDocV1, createNovelHeading, textToNovelParagraphs } from "@/lib/novel-doc"
import type { ApiCurrentUser } from "@/server/shared/current-user"
import type { DocStatus, HolderRole, ProjectLifecycle, ProjectStage, StagePlanStatus } from "@/types/domain"
import type {
  ChapterDoc,
  CreateChapterInput,
  GovernanceDocSummaryItem,
  ProjectChapterLocator,
  ProjectDetail,
  ProjectDocDirectory,
  ProjectExportFormat,
  ProjectExportScope,
  ProjectItem,
  ReorderChapterInput,
  ReleaseDocStatus,
  StagePlan,
} from "@/types/project"

type TxClient = Prisma.TransactionClient

type ProjectListFilters = {
  keyword?: string | null
  stage?: string | null
  lifecycle?: string | null
  overdue?: string | null
}

// 项目服务直接返回数据库真实阶段编码，页面层只负责把 release 翻译成“质检”。
const stageCodeToUiStage: Record<"synopsis" | "outline" | "chapter" | "release", ProjectStage> = {
  synopsis: "synopsis",
  outline: "outline",
  chapter: "chapter",
  release: "release",
}

// 阶段计划只覆盖四个协作阶段；“完成”是项目生命周期状态，不出现在阶段计划表里。
const editableStageOrder: Array<Exclude<ProjectStage, "completed">> = ["synopsis", "outline", "chapter", "release"]

// 新建 Doc 草稿时固定生成 Novel Editor Tiptap JSON v1，旧的无 attrs 根结构不再用于新稿。
const DEFAULT_CONTENT_SCHEMA_VERSION = 1

const userSummarySelect = {
  userId: true,
  username: true,
  displayName: true,
} satisfies Prisma.UserSelect

const revisionExportSelect = {
  revisionId: true,
  revisionNo: true,
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
  contentHash: true,
  createdAt: true,
} satisfies Prisma.DocRevisionSelect

const activeDraftSummarySelect = {
  draftId: true,
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
} satisfies Prisma.DocCurrentDraftSelect

const projectInclude = {
  sourceSi: {
    select: {
      siId: true,
      title: true,
      status: true,
    },
  },
  editor: {
    select: userSummarySelect,
  },
  author: {
    select: userSummarySelect,
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
        select: userSummarySelect,
      },
      finalRevision: {
        select: revisionExportSelect,
      },
      activeDraft: {
        select: activeDraftSummarySelect,
      },
    },
    orderBy: [{ stageCode: "asc" }, { sortOrder: "asc" }, { chapterNo: "asc" }],
  },
} satisfies Prisma.ProjectInclude

type ProjectRecord = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>

type ChapterRecord = ProjectRecord["docs"][number]

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

function countWordsForChineseText(text: string | null | undefined) {
  // 当前项目里字数口径先按“去空白后的字符数”近似计算，
  // 与现有 SI/Doc 服务保持一致，避免不同接口出现两套统计算法。
  return text?.replace(/\s/g, "").length ?? 0
}

function dbDocStatusToUiStatus(status: "draft" | "submitted" | "rejected" | "approved"): DocStatus {
  return status === "rejected" ? "returned" : status
}

function dbProjectStageToUiStage(stage: "synopsis" | "outline" | "chapter" | "release" | "completed"): ProjectStage {
  if (stage === "completed") {
    return "completed"
  }

  return stageCodeToUiStage[stage]
}

function stageTimingNote(stage: Exclude<ProjectStage, "completed">) {
  if (stage === "synopsis") return "确认转项目后开始"
  if (stage === "outline") return "梗概通过后开始"
  if (stage === "chapter") return "细纲通过后开始"
  return "手动解锁后开始"
}

function makeProjectVisibilityWhere(actor: ApiCurrentUser, projectId?: bigint): Prisma.ProjectWhereInput {
  const baseWhere: Prisma.ProjectWhereInput = projectId
    ? {
        projectId,
      }
    : {}

  // 管理员具备治理视角，允许读取全部项目；
  // 编辑和作者则严格受项目归属约束，避免跨项目读到不应可见的数据。
  if (actor.role === "admin") {
    return baseWhere
  }

  if (actor.role === "editor") {
    return {
      ...baseWhere,
      editorId: actor.userId,
    }
  }

  return {
    ...baseWhere,
    authorId: actor.userId,
  }
}

async function findVisibleProjectOrThrow(
  client: Pick<TxClient, "project"> | typeof prisma,
  actor: ApiCurrentUser,
  projectId: bigint,
) {
  const project = await client.project.findFirst({
    where: makeProjectVisibilityWhere(actor, projectId),
    include: projectInclude,
  })

  if (!project) {
    throw new ApiError({
      status: 404,
      code: "PROJECT_NOT_FOUND",
      message: "项目不存在或无权访问",
    })
  }

  return project
}

function assertProjectWritable(project: ProjectRecord) {
  if (project.lifecycleStatus !== "active") {
    throw new ApiError({
      status: 409,
      code: "PROJECT_READ_ONLY",
      message: "当前项目不是进行中状态，不能继续修改",
    })
  }
}

function assertCollaboratorCanManageProject(actor: ApiCurrentUser, project: ProjectRecord) {
  // 项目层的章节编排、质检解锁等动作只允许管理员或当前项目协作者操作；
  // 这里不额外区分作者/编辑，是为了兼容当前前端对章节管理入口的角色设计。
  if (actor.role === "admin") {
    return
  }

  if (actor.role === "editor" && actor.userId === project.editorId) {
    return
  }

  if (actor.role === "author" && actor.userId === project.authorId) {
    return
  }

  throw new ApiError({
    status: 403,
    code: "PROJECT_FORBIDDEN",
    message: "无权修改当前项目",
  })
}

function assertEditorOrAdmin(actor: ApiCurrentUser, project: ProjectRecord) {
  // 质检解锁、项目完成、项目导出属于编辑治理动作，不向作者开放。
  if (actor.role === "admin") {
    return
  }

  if (actor.role === "editor" && actor.userId === project.editorId) {
    return
  }

  throw new ApiError({
    status: 403,
    code: "PROJECT_EDITOR_ONLY",
    message: "只有项目编辑或管理员可以执行该操作",
  })
}

function assertChapterStructureEditable(project: ProjectRecord) {
  // 正文章节一旦进入质检协作阶段，就不允许继续新增、删除或重排。
  // 否则 Release Doc 的来源章节集合会和项目结构发生漂移，导出与审计都会失真。
  if (project.currentStage === "release" || project.releaseStatus !== "locked") {
    throw new ApiError({
      status: 409,
      code: "PROJECT_CHAPTER_STRUCTURE_LOCKED",
      message: "项目已进入质检阶段，不能再调整正文章节结构",
    })
  }
}

function toStagePlan(plan: ProjectRecord["stagePlans"][number]): StagePlan {
  const stage = stageCodeToUiStage[plan.stageCode] as Exclude<ProjectStage, "completed">

  return {
    stage,
    planDays: plan.planDays,
    startAt: toIsoString(plan.startedAt),
    dueAt: toIsoString(plan.dueAt),
    finishedAt: toIsoString(plan.completedAt),
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

  return dbDocStatusToUiStatus(releaseDoc.status)
}

function toChapterDoc(doc: ChapterRecord): ChapterDoc {
  return {
    id: doc.docId.toString(),
    // 章节列表页面真正依赖的是“显示顺序”，因此这里明确返回 sortOrder，
    // 避免 chapterNo 与拖拽排序语义混用后让前端显示错乱。
    order: doc.sortOrder,
    title: doc.title,
    status: dbDocStatusToUiStatus(doc.status),
    holder: doc.holderRole as HolderRole,
    words: doc.currentWordCount,
    lastNote: doc.lastHandoffNote ?? "",
    lastOperator: doc.lastActor ? userName(doc.lastActor) : "系统",
    lastOperatedAt: toIsoString(doc.lastActionAt) ?? doc.updatedAt.toISOString(),
    approved: doc.status === "approved",
  }
}

function toChapterLocator(doc: ChapterRecord): ProjectChapterLocator {
  return {
    docId: doc.docId.toString(),
    title: doc.title,
    chapterNo: doc.chapterNo,
    sortOrder: doc.sortOrder,
    status: dbDocStatusToUiStatus(doc.status),
    holderRole: doc.holderRole as HolderRole,
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
      statusLabel: synopsisDoc
        ? dbDocStatusToUiStatus(synopsisDoc.status) === "approved"
          ? "审核通过"
          : "进行中"
        : "未创建",
      tone: synopsisDoc?.status === "approved" ? "success" : synopsisDoc ? "info" : "neutral",
    },
    {
      key: "outline",
      title: "细纲 Doc",
      statusLabel: outlineDoc
        ? dbDocStatusToUiStatus(outlineDoc.status) === "approved"
          ? "审核通过"
          : "进行中"
        : "未解锁",
      tone: outlineDoc?.status === "approved" ? "success" : outlineDoc ? "info" : "neutral",
    },
    {
      key: "chapter",
      title: "正文章节 Doc",
      statusLabel: `${chapterDocs.filter((doc) => doc.status === "approved").length}/${chapterDocs.length} 章通过`,
      tone: chapterDocs.length > 0 ? "info" : "neutral",
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

function makeDocDirectory(project: ProjectRecord): ProjectDocDirectory {
  const synopsisDoc = project.docs.find((doc) => doc.docType === "synopsis")
  const outlineDoc = project.docs.find((doc) => doc.docType === "outline")
  const releaseDoc = project.docs.find((doc) => doc.docType === "release")
  const chapterDocs = project.docs.filter((doc) => doc.docType === "chapter").map(toChapterLocator)

  return {
    synopsisDocId: synopsisDoc?.docId.toString() ?? null,
    outlineDocId: outlineDoc?.docId.toString() ?? null,
    releaseDocId: releaseDoc?.docId.toString() ?? null,
    chapterDocs,
  }
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
    lifecycle: project.lifecycleStatus as ProjectLifecycle,
    planStatus: stage === "completed" ? "completed" : (currentPlan?.status ?? "not_started"),
    pendingDocs: project.docs.filter((doc) => doc.status !== "approved").length,
    overdue: project.stagePlans.some((plan) => plan.timelineStatus === "overdue"),
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    finishedAt: toIsoString(project.completedAt),
    releaseDocStatus: projectReleaseDocStatus(project),
    totalChapters: chapterDocs.length,
    approvedChapters: chapterDocs.filter((item) => item.approved).length,
    stagePlans,
    chapters: chapterDocs,
  }
}

function toProjectDetail(project: ProjectRecord): ProjectDetail {
  return {
    ...toProjectItem(project),
    sourceSiStatus: project.sourceSi.status,
    docSummary: makeDocSummary(project),
    docDirectory: makeDocDirectory(project),
  }
}

function makeEmptyDocContent(input: {
  docId: bigint
  docType: "synopsis" | "outline" | "chapter" | "release"
  title: string
  now: Date
}) {
  return createNovelDocV1({
    docId: input.docId,
    docType: input.docType,
    title: input.title,
    createdAt: input.now,
    updatedAt: input.now,
  }) as unknown as Prisma.InputJsonObject
}

function makeReleaseDocContent(chapters: ChapterRecord[], input: { docId: bigint; now: Date }) {
  return createNovelDocV1({
    docId: input.docId,
    docType: "release",
    title: "质检",
    createdAt: input.now,
    updatedAt: input.now,
    content: chapters.flatMap((chapter) => {
      const body =
        chapter.finalRevision?.cleanText ??
        chapter.finalRevision?.plainText ??
        chapter.currentCleanText ??
        chapter.currentPlainText ??
        ""

      return [
        createNovelHeading({ text: chapter.title, level: 1 }),
        ...textToNovelParagraphs(body),
      ]
    }),
  }) as unknown as Prisma.InputJsonObject
}

function pickRevisionExportText(doc: ChapterRecord | null | undefined) {
  if (!doc) {
    return null
  }

  return (
    doc.finalRevision?.exportText ??
    doc.finalRevision?.cleanText ??
    doc.finalRevision?.plainText ??
    null
  )
}

function makeMarkdownSection(title: string, body: string) {
  return `# ${title}\n\n${body.trim()}\n`
}

function makeDocxSection(title: string, body: string) {
  return {
    title,
    body: body.trim(),
  }
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
    select: {
      draftId: true,
    },
  })
}

async function writeOperationLog(
  tx: TxClient,
  input: {
    actor: ApiCurrentUser
    action: string
    entityType: string
    entityId: bigint
    projectId: bigint
    docId?: bigint
    beforeJson?: Prisma.InputJsonValue
    afterJson?: Prisma.InputJsonValue
    metadataJson?: Prisma.InputJsonValue
  },
) {
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

async function createProjectNotification(
  tx: TxClient,
  input: {
    recipientUserId: bigint
    type: string
    title: string
    body: string
    projectId: bigint
    entityId: bigint
    docId?: bigint
  },
) {
  await tx.notification.create({
    data: {
      recipientUserId: input.recipientUserId,
      type: input.type,
      title: input.title,
      body: input.body,
      projectId: input.projectId,
      docId: input.docId,
      entityType: input.docId ? "doc" : "project",
      entityId: input.entityId,
    },
  })
}

async function unlockStagePlan(tx: TxClient, projectId: bigint, stageCode: "release", now: Date) {
  const stagePlan = await tx.projectStagePlan.findFirst({
    where: {
      projectId,
      stageCode,
    },
  })

  if (!stagePlan) {
    throw new ApiError({
      status: 409,
      code: "PROJECT_STAGE_PLAN_MISSING",
      message: "质检阶段计划不存在，无法解锁",
    })
  }

  if (stagePlan.gateStatus === "completed") {
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

async function completeStagePlan(tx: TxClient, projectId: bigint, stageCode: "chapter", now: Date) {
  const stagePlan = await tx.projectStagePlan.findFirst({
    where: {
      projectId,
      stageCode,
    },
  })

  if (!stagePlan) {
    throw new ApiError({
      status: 409,
      code: "PROJECT_STAGE_PLAN_MISSING",
      message: "正文阶段计划不存在，无法完成",
    })
  }

  if (stagePlan.gateStatus === "completed" && stagePlan.timelineStatus === "completed") {
    return stagePlan
  }

  // 质检解锁意味着所有章节已审核通过，正文阶段应同时完成；
  // 否则阶段计划会一直停在 unlocked/in_progress，后续预警任务会持续误报正文逾期。
  await tx.projectStagePlan.update({
    where: {
      stagePlanId: stagePlan.stagePlanId,
    },
    data: {
      gateStatus: "completed",
      timelineStatus: "completed",
      completedAt: stagePlan.completedAt ?? now,
    },
  })

  return stagePlan
}

export async function listMyProjects(actor: ApiCurrentUser, filters: ProjectListFilters = {}) {
  await syncActiveProjectTimelineStatuses()

  const keyword = trimToNull(filters.keyword)
  const stage = trimToNull(filters.stage)
  const lifecycle = trimToNull(filters.lifecycle)
  const overdue = trimToNull(filters.overdue)

  const projects = await prisma.project.findMany({
    where: {
      ...makeProjectVisibilityWhere(actor),
      ...(keyword
        ? {
            OR: [
              { title: { contains: keyword } },
              { sourceSi: { title: { contains: keyword } } },
            ],
          }
        : {}),
      ...(lifecycle && lifecycle !== "all"
        ? {
            lifecycleStatus: lifecycle as Prisma.ProjectWhereInput["lifecycleStatus"],
          }
        : {}),
      ...(overdue === "yes" && (!lifecycle || lifecycle === "all") ? { lifecycleStatus: "active" } : {}),
      ...(stage && stage !== "all"
        ? {
            currentStage:
              stage === "completed"
                ? "completed"
                : stage as Prisma.ProjectWhereInput["currentStage"],
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

  return {
    items: projects.map(toProjectItem),
  }
}

export async function getProjectDetail(actor: ApiCurrentUser, projectIdValue: string) {
  await syncActiveProjectTimelineStatuses()

  const projectId = parseBigIntId(projectIdValue, "项目 ID")
  const project = await findVisibleProjectOrThrow(prisma, actor, projectId)

  return {
    project: toProjectDetail(project),
  }
}

export async function getProjectDocDirectory(actor: ApiCurrentUser, projectIdValue: string) {
  await syncActiveProjectTimelineStatuses()

  const projectId = parseBigIntId(projectIdValue, "项目 ID")
  const project = await findVisibleProjectOrThrow(prisma, actor, projectId)

  return {
    projectId: project.projectId.toString(),
    title: project.title,
    docDirectory: makeDocDirectory(project),
  }
}

export async function listProjectChapters(actor: ApiCurrentUser, projectIdValue: string) {
  await syncActiveProjectTimelineStatuses()

  const projectId = parseBigIntId(projectIdValue, "项目 ID")
  const project = await findVisibleProjectOrThrow(prisma, actor, projectId)
  const chapterDocs = project.docs.filter((doc) => doc.docType === "chapter").map(toChapterDoc)
  const chapterStagePlan = project.stagePlans.find((plan) => plan.stageCode === "chapter") ?? null

  return {
    projectId: project.projectId.toString(),
    title: project.title,
    chapters: chapterDocs,
    totalChapters: chapterDocs.length,
    approvedChapters: chapterDocs.filter((item) => item.approved).length,
    stageGateStatus: chapterStagePlan?.gateStatus ?? "locked",
    stageTimelineStatus: chapterStagePlan?.timelineStatus ?? "not_started",
  }
}

export async function createProjectChapter(actor: ApiCurrentUser, projectIdValue: string, input: CreateChapterInput) {
  const projectId = parseBigIntId(projectIdValue, "项目 ID")
  const title = trimToNull(input.title)
  const chapterNo = input.chapterNo ?? null
  const now = new Date()

  if (!title) {
    throw new ApiError({
      status: 400,
      code: "CHAPTER_TITLE_REQUIRED",
      message: "章节标题不能为空",
    })
  }

  if (chapterNo !== null && (!Number.isInteger(chapterNo) || chapterNo <= 0)) {
    throw new ApiError({
      status: 400,
      code: "CHAPTER_NO_INVALID",
      message: "章节号必须是正整数",
    })
  }

  try {
    await prisma.$transaction(async (tx) => {
      const project = await findVisibleProjectOrThrow(tx, actor, projectId)
      assertProjectWritable(project)
      assertCollaboratorCanManageProject(actor, project)
      assertChapterStructureEditable(project)

      const chapterDocs = project.docs.filter((doc) => doc.docType === "chapter")
      const nextSortOrder = chapterDocs.reduce((max, doc) => Math.max(max, doc.sortOrder), 0) + 1

      if (chapterNo !== null && chapterDocs.some((doc) => doc.chapterNo === chapterNo)) {
        throw new ApiError({
          status: 409,
          code: "CHAPTER_NO_CONFLICT",
          message: "该章节号已存在，请调整后重试",
        })
      }

      const doc = await tx.doc.create({
        data: {
          projectId: project.projectId,
          docType: "chapter",
          stageCode: "chapter",
          title,
          chapterNo,
          sortOrder: nextSortOrder,
          status: "draft",
          holderRole: "author",
          currentWordCount: 0,
          currentPlainText: null,
          currentCleanText: null,
          summary: null,
          lastAction: null,
          lastActorId: null,
          lastActionAt: null,
          lastHandoffNote: null,
          // 章节排序唯一键要跟着 sortOrder 一起写入，避免同项目出现重复排序值。
          chapterOrderKey: makeChapterOrderKey(project.projectId, nextSortOrder),
          // 章节号允许为空；填写时写入活动唯一键，由数据库兜住并发创建的重复章节号。
          chapterNoKey: makeChapterNoKey(project.projectId, chapterNo),
        },
        select: {
          docId: true,
        },
      })

      const draft = await createActiveDraft(tx, {
        docId: doc.docId,
        ownerRole: "author",
        ownerUserId: project.authorId,
        baseRevisionId: null,
        contentSchemaVersion: DEFAULT_CONTENT_SCHEMA_VERSION,
        contentJson: makeEmptyDocContent({
          docId: doc.docId,
          docType: "chapter",
          title,
          now,
        }),
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
          docId: doc.docId,
        },
        data: {
          activeDraftId: draft.draftId,
        },
      })

      await writeOperationLog(tx, {
        actor,
        action: "project.chapter.create",
        entityType: "doc",
        entityId: doc.docId,
        projectId: project.projectId,
        docId: doc.docId,
        afterJson: {
          title,
          chapterNo,
          sortOrder: nextSortOrder,
        },
      })
    })
  } catch (error) {
    throw (
      translateUniqueConstraintError(error, [
        {
          constraintIncludes: ["chapter_order_key"],
          code: "CHAPTER_ORDER_CONFLICT",
          message: "章节排序已在其他操作中变化，请刷新后重试",
        },
        {
          constraintIncludes: ["chapter_no_key"],
          code: "CHAPTER_NO_CONFLICT",
          message: "该章节号已存在，请调整后重试",
        },
        {
          constraintIncludes: ["active_doc_key"],
          code: "DOC_ACTIVE_DRAFT_CONFLICT",
          message: "当前章节已存在活动草稿，请刷新后重试",
        },
      ]) ?? error
    )
  }

  return getProjectDetail(actor, projectIdValue)
}

export async function reorderProjectChapters(actor: ApiCurrentUser, projectIdValue: string, input: ReorderChapterInput) {
  const projectId = parseBigIntId(projectIdValue, "项目 ID")
  const orderedDocIds = input.orderedDocIds.map((item) => parseBigIntId(item, "章节 Doc ID"))

  if (orderedDocIds.length === 0) {
    throw new ApiError({
      status: 400,
      code: "CHAPTER_ORDER_EMPTY",
      message: "章节排序列表不能为空",
    })
  }

  try {
    await prisma.$transaction(async (tx) => {
      const project = await findVisibleProjectOrThrow(tx, actor, projectId)
      assertProjectWritable(project)
      assertCollaboratorCanManageProject(actor, project)
      assertChapterStructureEditable(project)

      const chapterDocs = project.docs.filter((doc) => doc.docType === "chapter")

      if (chapterDocs.length !== orderedDocIds.length) {
        throw new ApiError({
          status: 400,
          code: "CHAPTER_ORDER_SIZE_MISMATCH",
          message: "排序数量与当前章节数量不一致",
        })
      }

      const chapterIdSet = new Set(chapterDocs.map((doc) => doc.docId.toString()))
      const orderedIdSet = new Set(orderedDocIds.map((docId) => docId.toString()))

      if (chapterIdSet.size !== orderedIdSet.size || [...chapterIdSet].some((id) => !orderedIdSet.has(id))) {
        throw new ApiError({
          status: 400,
          code: "CHAPTER_ORDER_INVALID",
          message: "排序列表与当前项目章节不匹配",
        })
      }

      // 重排时先整体释放旧的 chapterOrderKey，再写入新的排序和值，
      // 避免两个章节互换顺序时因为唯一键暂时碰撞而中途失败。
      await tx.doc.updateMany({
        where: {
          projectId: project.projectId,
          docType: "chapter",
          isDeleted: false,
        },
        data: {
          chapterOrderKey: null,
        },
      })

      for (const [index, docId] of orderedDocIds.entries()) {
        await tx.doc.update({
          where: {
            docId,
          },
          data: {
            sortOrder: index + 1,
            chapterOrderKey: makeChapterOrderKey(project.projectId, index + 1),
          },
        })
      }

      await writeOperationLog(tx, {
        actor,
        action: "project.chapter.reorder",
        entityType: "project",
        entityId: project.projectId,
        projectId: project.projectId,
        afterJson: {
          orderedDocIds: orderedDocIds.map((docId) => docId.toString()),
        },
      })
    })
  } catch (error) {
    throw (
      translateUniqueConstraintError(error, [
        {
          constraintIncludes: ["chapter_order_key"],
          code: "CHAPTER_ORDER_CONFLICT",
          message: "章节排序已在其他操作中变化，请刷新后重试",
        },
      ]) ?? error
    )
  }

  return getProjectDetail(actor, projectIdValue)
}

export async function deleteProjectChapter(
  actor: ApiCurrentUser,
  projectIdValue: string,
  docIdValue: string,
) {
  const projectId = parseBigIntId(projectIdValue, "项目 ID")
  const docId = parseBigIntId(docIdValue, "章节 Doc ID")

  await prisma.$transaction(async (tx) => {
    const project = await findVisibleProjectOrThrow(tx, actor, projectId)
    assertProjectWritable(project)
    assertCollaboratorCanManageProject(actor, project)
    assertChapterStructureEditable(project)

    const chapterDoc = project.docs.find((doc) => doc.docId === docId && doc.docType === "chapter")

    if (!chapterDoc) {
      throw new ApiError({
        status: 404,
        code: "CHAPTER_DOC_NOT_FOUND",
        message: "章节 Doc 不存在",
      })
    }

    if (chapterDoc.status === "approved") {
      throw new ApiError({
        status: 409,
        code: "CHAPTER_DOC_APPROVED",
        message: "已审核通过的章节不能删除",
      })
    }

    if (chapterDoc.activeDraftId) {
      await tx.docCurrentDraft.updateMany({
        where: {
          docId: chapterDoc.docId,
          status: "active",
        },
        data: {
          status: "archived",
          activeDocKey: null,
        },
      })
    }

    await tx.todoItem.updateMany({
      where: {
        docId: chapterDoc.docId,
        status: "open",
      },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        openDedupeKey: null,
      },
    })

    await tx.doc.update({
      where: {
        docId: chapterDoc.docId,
      },
      data: {
        isDeleted: true,
        holderRole: "none",
        activeDraftId: null,
        chapterOrderKey: null,
        chapterNoKey: null,
      },
    })

    await writeOperationLog(tx, {
      actor,
      action: "project.chapter.delete",
      entityType: "doc",
      entityId: chapterDoc.docId,
      projectId: project.projectId,
      docId: chapterDoc.docId,
      beforeJson: {
        title: chapterDoc.title,
        status: chapterDoc.status,
        sortOrder: chapterDoc.sortOrder,
      },
      afterJson: {
        isDeleted: true,
      },
    })
  })

  return getProjectDetail(actor, projectIdValue)
}

export async function unlockProjectQc(actor: ApiCurrentUser, projectIdValue: string) {
  const projectId = parseBigIntId(projectIdValue, "项目 ID")
  const now = new Date()

  try {
    await prisma.$transaction(async (tx) => {
      const project = await findVisibleProjectOrThrow(tx, actor, projectId)
      assertProjectWritable(project)
      assertEditorOrAdmin(actor, project)

      if (project.releaseStatus !== "locked") {
        throw new ApiError({
          status: 409,
          code: "PROJECT_QC_ALREADY_UNLOCKED",
          message: "质检已解锁，无需重复操作",
        })
      }

    const chapterDocs = project.docs
      .filter((doc) => doc.docType === "chapter")
      .sort((a, b) => a.sortOrder - b.sortOrder)

    if (chapterDocs.length === 0) {
      throw new ApiError({
        status: 409,
        code: "PROJECT_QC_NO_CHAPTERS",
        message: "当前项目还没有正文章节，不能解锁质检",
      })
    }

    const unapproved = chapterDocs.filter((doc) => doc.status !== "approved")
    if (unapproved.length > 0) {
      throw new ApiError({
        status: 409,
        code: "PROJECT_QC_CHAPTERS_PENDING",
        message: "仍有正文章节未审核通过，不能解锁质检",
      })
    }

    const releaseText = chapterDocs
      .map((doc) => pickRevisionExportText(doc) ?? "")
      .filter((item) => item.trim())
      .join("\n\n")
      .trim()
    const releaseWordCount = chapterDocs.reduce(
      (sum, doc) => sum + (doc.finalRevision?.wordCount ?? doc.currentWordCount),
      0,
    )

    let releaseDocId: bigint
    const existingReleaseDoc = project.docs.find((doc) => doc.docType === "release")

    if (!existingReleaseDoc) {
      const releaseDoc = await tx.doc.create({
        data: {
          projectId: project.projectId,
          docType: "release",
          stageCode: "release",
          title: "质检",
          status: "draft",
          holderRole: "author",
          currentWordCount: releaseWordCount,
          currentPlainText: releaseText || null,
          currentCleanText: releaseText || null,
          summary: null,
          lastAction: "author_save",
          lastActorId: project.authorId,
          lastActionAt: now,
          // 质检 Doc 也是项目内唯一单据，必须把唯一键一并写入数据库。
          singleDocKey: makeSingleDocKey(project.projectId, "release"),
        },
        select: {
          docId: true,
        },
      })

      const releaseContent = makeReleaseDocContent(chapterDocs, {
        docId: releaseDoc.docId,
        now,
      })

      const draft = await createActiveDraft(tx, {
        docId: releaseDoc.docId,
        ownerRole: "author",
        ownerUserId: project.authorId,
        baseRevisionId: null,
        contentSchemaVersion: DEFAULT_CONTENT_SCHEMA_VERSION,
        contentJson: releaseContent,
        wordCount: releaseWordCount,
        plainText: releaseText || null,
        cleanText: releaseText || null,
        exportText: releaseText || null,
        summary: null,
        commentCount: 0,
        suggestionCount: 0,
        revisionMarkCount: 0,
      })

      await tx.doc.update({
        where: {
          docId: releaseDoc.docId,
        },
        data: {
          activeDraftId: draft.draftId,
        },
      })

      releaseDocId = releaseDoc.docId
    } else {
      releaseDocId = existingReleaseDoc.docId
      const releaseContent = makeReleaseDocContent(chapterDocs, {
        docId: existingReleaseDoc.docId,
        now,
      })

      if (existingReleaseDoc.activeDraft?.status === "active") {
        await tx.docCurrentDraft.update({
          where: {
            draftId: existingReleaseDoc.activeDraft.draftId,
          },
          data: {
            ownerRole: "author",
            ownerUserId: project.authorId,
            contentSchemaVersion: DEFAULT_CONTENT_SCHEMA_VERSION,
            contentJson: releaseContent,
            wordCount: releaseWordCount,
            plainText: releaseText || null,
            cleanText: releaseText || null,
            exportText: releaseText || null,
            summary: null,
            commentCount: 0,
            suggestionCount: 0,
            revisionMarkCount: 0,
            status: "active",
            activeDocKey: makeActiveDocKey(existingReleaseDoc.docId),
          },
        })
      } else {
        const draft = await createActiveDraft(tx, {
          docId: existingReleaseDoc.docId,
          ownerRole: "author",
          ownerUserId: project.authorId,
          baseRevisionId: existingReleaseDoc.finalRevisionId ?? existingReleaseDoc.latestRevisionId,
          contentSchemaVersion: DEFAULT_CONTENT_SCHEMA_VERSION,
          contentJson: releaseContent,
          wordCount: releaseWordCount,
          plainText: releaseText || null,
          cleanText: releaseText || null,
          exportText: releaseText || null,
          summary: null,
          commentCount: 0,
          suggestionCount: 0,
          revisionMarkCount: 0,
        })

        await tx.doc.update({
          where: {
            docId: existingReleaseDoc.docId,
          },
          data: {
            activeDraftId: draft.draftId,
          },
        })
      }

      await tx.doc.update({
        where: {
          docId: existingReleaseDoc.docId,
        },
        data: {
          status: "draft",
          holderRole: "author",
          currentWordCount: releaseWordCount,
          currentPlainText: releaseText || null,
          currentCleanText: releaseText || null,
          singleDocKey: makeSingleDocKey(project.projectId, "release"),
          lastAction: "author_save",
          lastActorId: project.authorId,
          lastActionAt: now,
          lastHandoffNote: null,
          submittedAt: null,
          reviewedAt: null,
          approvedAt: null,
        },
      })

      await tx.releaseSourceRevision.deleteMany({
        where: {
          releaseDocId: existingReleaseDoc.docId,
        },
      })
    }

    await tx.releaseSourceRevision.createMany({
      data: chapterDocs.map((doc, index) => ({
        projectId: project.projectId,
        releaseDocId,
        sourceChapterDocId: doc.docId,
        sourceRevisionId: doc.finalRevisionId!,
        sourceOrder: index + 1,
      })),
    })

    await completeStagePlan(tx, project.projectId, "chapter", now)
    await unlockStagePlan(tx, project.projectId, "release", now)

    await tx.project.update({
      where: {
        projectId: project.projectId,
      },
      data: {
        releaseStatus: "unlocked",
        currentStage: "release",
      },
    })

    await createProjectNotification(tx, {
      recipientUserId: project.authorId,
      type: "project_enter_qc",
      title: "项目已进入质检",
      body: `《${project.title}》已解锁质检，请开始质检协作。`,
      projectId: project.projectId,
      entityId: releaseDocId,
      docId: releaseDocId,
    })

    await writeOperationLog(tx, {
      actor,
      action: "project.qc.unlock",
      entityType: "project",
      entityId: project.projectId,
      projectId: project.projectId,
      afterJson: {
        releaseStatus: "unlocked",
        releaseDocId: releaseDocId.toString(),
        chapterCount: chapterDocs.length,
      },
    })
  })
  } catch (error) {
    throw (
      translateUniqueConstraintError(error, [
        {
          constraintIncludes: ["single_doc_key"],
          code: "RELEASE_DOC_EXISTS",
          message: "质检 Doc 已在其他操作中创建，请刷新后重试",
        },
        {
          constraintIncludes: ["active_doc_key"],
          code: "DOC_ACTIVE_DRAFT_CONFLICT",
          message: "质检稿件已在其他操作中生成活动草稿，请刷新后重试",
        },
      ]) ?? error
    )
  }

  return getProjectDetail(actor, projectIdValue)
}

export async function completeProject(actor: ApiCurrentUser, projectIdValue: string) {
  const projectId = parseBigIntId(projectIdValue, "项目 ID")
  const now = new Date()

  await prisma.$transaction(async (tx) => {
    const project = await findVisibleProjectOrThrow(tx, actor, projectId)
    assertProjectWritable(project)
    assertEditorOrAdmin(actor, project)

    if (project.releaseStatus !== "approved") {
      throw new ApiError({
        status: 409,
        code: "PROJECT_CANNOT_COMPLETE",
        message: "质检未通过，不能标记项目完成",
      })
    }

    await tx.project.update({
      where: {
        projectId: project.projectId,
      },
      data: {
        lifecycleStatus: "completed",
        currentStage: "completed",
        completedAt: now,
      },
    })

    await tx.todoItem.updateMany({
      where: {
        projectId: project.projectId,
        status: "open",
      },
      data: {
        status: "cancelled",
        cancelledAt: now,
        openDedupeKey: null,
      },
    })

    await createProjectNotification(tx, {
      recipientUserId: project.authorId,
      type: "project_completed",
      title: "项目已完成",
      body: `《${project.title}》已标记为完成。`,
      projectId: project.projectId,
      entityId: project.projectId,
    })

    if (project.editorId !== project.authorId) {
      await createProjectNotification(tx, {
        recipientUserId: project.editorId,
        type: "project_completed",
        title: "项目已完成",
        body: `《${project.title}》已标记为完成。`,
        projectId: project.projectId,
        entityId: project.projectId,
      })
    }

    await writeOperationLog(tx, {
      actor,
      action: "project.complete",
      entityType: "project",
      entityId: project.projectId,
      projectId: project.projectId,
      beforeJson: {
        lifecycleStatus: project.lifecycleStatus,
        currentStage: project.currentStage,
      },
      afterJson: {
        lifecycleStatus: "completed",
        currentStage: "completed",
      },
    })
  })

  return getProjectDetail(actor, projectIdValue)
}

export async function exportProjectContent(
  actor: ApiCurrentUser,
  projectIdValue: string,
  scope: ProjectExportScope,
  format: ProjectExportFormat = "markdown",
) {
  await syncActiveProjectTimelineStatuses()

  const projectId = parseBigIntId(projectIdValue, "项目 ID")
  const project = await findVisibleProjectOrThrow(prisma, actor, projectId)
  assertEditorOrAdmin(actor, project)

  const synopsisDoc = project.docs.find((doc) => doc.docType === "synopsis")
  const outlineDoc = project.docs.find((doc) => doc.docType === "outline")
  const releaseDoc = project.docs.find((doc) => doc.docType === "release")
  const chapterDocs = project.docs
    .filter((doc) => doc.docType === "chapter" && doc.status === "approved")
    .sort((a, b) => a.sortOrder - b.sortOrder)

  if (scope === "synopsis") {
    const body = pickRevisionExportText(synopsisDoc)
    if (!synopsisDoc || !body?.trim()) {
      throw new ApiError({
        status: 409,
        code: "PROJECT_EXPORT_SOURCE_MISSING",
        message: "梗概 Doc 暂无可导出的有效内容",
      })
    }

    if (format === "docx") {
      return {
        filename: `${project.title}-梗概.docx`,
        content: await buildDocxBuffer({
          title: `${project.title} - 梗概`,
          sections: [makeDocxSection("梗概", body)],
        }),
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }
    }

    return {
      filename: `${project.title}-梗概.md`,
      content: makeMarkdownSection("梗概", body),
      contentType: "text/markdown; charset=utf-8",
    }
  }

  if (scope === "outline") {
    const body = pickRevisionExportText(outlineDoc)
    if (!outlineDoc || !body?.trim()) {
      throw new ApiError({
        status: 409,
        code: "PROJECT_EXPORT_SOURCE_MISSING",
        message: "细纲 Doc 暂无可导出的有效内容",
      })
    }

    if (format === "docx") {
      return {
        filename: `${project.title}-细纲.docx`,
        content: await buildDocxBuffer({
          title: `${project.title} - 细纲`,
          sections: [makeDocxSection("细纲", body)],
        }),
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }
    }

    return {
      filename: `${project.title}-细纲.md`,
      content: makeMarkdownSection("细纲", body),
      contentType: "text/markdown; charset=utf-8",
    }
  }

  if (scope === "chapters") {
    if (chapterDocs.length === 0) {
      throw new ApiError({
        status: 409,
        code: "PROJECT_EXPORT_SOURCE_MISSING",
        message: "当前项目还没有可导出的已通过正文章节",
      })
    }

    const sections = chapterDocs
      .map((doc) => {
        const body = pickRevisionExportText(doc)
        return body?.trim() ? makeDocxSection(doc.title, body) : null
      })
      .filter((item): item is ReturnType<typeof makeDocxSection> => Boolean(item))

    if (format === "docx") {
      return {
        filename: `${project.title}-正文合集.docx`,
        content: await buildDocxBuffer({
          title: `${project.title} - 正文合集`,
          sections,
        }),
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }
    }

    const content = chapterDocs
      .map((doc) => {
        const body = pickRevisionExportText(doc)
        return body?.trim() ? makeMarkdownSection(doc.title, body) : null
      })
      .filter((item): item is string => Boolean(item))
      .join("\n")

    return {
      filename: `${project.title}-正文合集.md`,
      content,
      contentType: "text/markdown; charset=utf-8",
    }
  }

  if (scope === "release") {
    const body = pickRevisionExportText(releaseDoc)
    if (!releaseDoc || !body?.trim()) {
      throw new ApiError({
        status: 409,
        code: "PROJECT_EXPORT_SOURCE_MISSING",
        message: "质检 Doc 暂无可导出的有效内容",
      })
    }

    if (format === "docx") {
      return {
        filename: `${project.title}-质检.docx`,
        content: await buildDocxBuffer({
          title: `${project.title} - 质检`,
          sections: [makeDocxSection("质检", body)],
        }),
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }
    }

    return {
      filename: `${project.title}-质检.md`,
      content: makeMarkdownSection("质检", body),
      contentType: "text/markdown; charset=utf-8",
    }
  }

  if (project.releaseStatus !== "approved" || !releaseDoc) {
    throw new ApiError({
      status: 409,
      code: "PROJECT_FINAL_NOT_READY",
      message: "质检未通过，整个项目的终稿导出尚未完成",
    })
  }

  const finalBody = pickRevisionExportText(releaseDoc)
  if (!finalBody?.trim()) {
    throw new ApiError({
      status: 409,
      code: "PROJECT_FINAL_NOT_READY",
      message: "当前项目还没有可导出的终稿内容",
    })
  }

  if (format === "docx") {
    return {
      filename: `${project.title}.docx`,
      content: await buildDocxBuffer({
        title: project.title,
        sections: [makeDocxSection("终稿", finalBody)],
      }),
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
  }

  return {
    filename: `${project.title}.md`,
    content: finalBody,
    contentType: "text/markdown; charset=utf-8",
  }
}
