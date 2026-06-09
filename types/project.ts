import type {
  BadgeTone,
  DocStatus,
  HolderRole,
  ProjectLifecycle,
  ProjectStage,
  StagePlanStatus,
} from "@/types/domain"

export const PROJECT_LIFECYCLE_TONE: Record<ProjectLifecycle, BadgeTone> = {
  draft: "neutral",
  active: "info",
  completed: "success",
  archived: "neutral",
  cancelled: "danger",
}

export const PROJECT_STAGE_TONE: Record<ProjectStage, BadgeTone> = {
  synopsis: "neutral",
  outline: "info",
  manuscript: "info",
  qc: "warning",
  done: "success",
}

export const STAGE_PLAN_TONE: Record<StagePlanStatus, BadgeTone> = {
  not_started: "neutral",
  in_progress: "info",
  due_soon: "warning",
  overdue: "danger",
  completed: "success",
}

export const DOC_STATUS_TONE: Record<DocStatus, BadgeTone> = {
  draft: "neutral",
  submitted: "info",
  returned: "warning",
  approved: "success",
}

export type QcStatus = "locked" | "unlocked" | "draft" | "submitted" | "returned" | "approved"

export const QC_STATUS_LABELS: Record<QcStatus, string> = {
  locked: "未解锁",
  unlocked: "已解锁",
  draft: "草稿",
  submitted: "已提交待审",
  returned: "退回待改",
  approved: "审核通过",
}

export const QC_STATUS_TONE: Record<QcStatus, BadgeTone> = {
  locked: "neutral",
  unlocked: "info",
  draft: "neutral",
  submitted: "info",
  returned: "warning",
  approved: "success",
}

export const STAGE_ORDER: ProjectStage[] = ["synopsis", "outline", "manuscript", "qc", "done"]

export interface StagePlan {
  stage: ProjectStage
  planDays: number
  startAt: string | null
  dueAt: string | null
  finishedAt: string | null
  status: StagePlanStatus
  timingNote: string
}

export interface ChapterDoc {
  id: string
  order: number
  title: string
  status: DocStatus
  holder: HolderRole
  words: number
  lastNote: string
  lastOperator: string
  lastOperatedAt: string
  approved: boolean
}

export interface ProjectItem {
  id: string
  title: string
  sourceSi: string
  sourceSiId: string
  editor: string
  editorId: string
  author: string
  authorId: string
  stage: ProjectStage
  lifecycle: ProjectLifecycle
  planStatus: StagePlanStatus
  pendingDocs: number
  overdue: boolean
  createdAt: string
  updatedAt: string
  finishedAt: string | null
  qcStatus: QcStatus
  totalChapters: number
  approvedChapters: number
  stagePlans: StagePlan[]
  chapters: ChapterDoc[]
}

export interface ProjectPersonOption {
  id: string
  name: string
}

export interface GovernanceDocSummaryItem {
  key: "synopsis" | "outline" | "chapter" | "release"
  title: string
  statusLabel: string
  tone: BadgeTone
}

export interface GovernanceProjectDetail extends ProjectItem {
  sourceSiStatus?: string
  docSummary: GovernanceDocSummaryItem[]
  recentAuditLogs: AuditLogSummary[]
}

export interface AuditLogSummary {
  id: string
  time: string
  operator: string
  action: string
  before: string
  after: string
}

// 项目详情页和 Doc 路由都需要知道“当前项目有哪些 Doc、每个 Doc 的真实 ID 是什么”，
// 因此这里单独抽一层目录结构，避免前端再靠标题或阶段名去猜数据库记录。
export interface ProjectDocDirectory {
  synopsisDocId: string | null
  outlineDocId: string | null
  releaseDocId: string | null
  chapterDocs: ProjectChapterLocator[]
}

// 正文阶段允许多章节并行，所以章节定位信息必须把章节序号、排序值、状态一起带回前端，
// 这样页面后续无论是“进入当前稿件”还是“章节排序管理”都能直接复用。
export interface ProjectChapterLocator {
  docId: string
  title: string
  chapterNo: number | null
  sortOrder: number
  status: DocStatus
  holderRole: HolderRole
  approved: boolean
}

// “我的项目”详情和管理员治理详情非常接近，但普通协作页不需要最近审计日志与全局治理信息，
// 因此这里保留一份更贴近业务协作面的详情结构。
export interface ProjectDetail extends ProjectItem {
  sourceSiStatus?: string
  docSummary: GovernanceDocSummaryItem[]
  docDirectory: ProjectDocDirectory
}

// 正文章节创建接口只需要最少的可编辑字段；章节号允许前端显式传入，
// 以便后续支持“第 X 章”与自由标题并存的录入方式。
export interface CreateChapterInput {
  title: string
  chapterNo?: number | null
}

// 章节重排接口统一接收“目标顺序数组”，这样服务端可以一次性重算全部 sortOrder，
// 避免前端多次调用带来的中间态冲突。
export interface ReorderChapterInput {
  orderedDocIds: string[]
}

// 项目导出当前先明确支持的业务范围；格式虽然数据库设计同时支持 docx/markdown，
// 但接口层会按当前后端实际能力返回可用格式。
export type ProjectExportScope = "synopsis" | "outline" | "chapters" | "qc" | "project"

export type ProjectExportFormat = "markdown"
