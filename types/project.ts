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
