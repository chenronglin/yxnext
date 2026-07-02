// 阅享平台 - Doc 核心接口类型定义

// 后端对外仍然使用数据库阶段编码，避免在接口层再引入一套 chapter/manuscript、release/qc 的映射。
export type ApiDocType = "synopsis" | "outline" | "chapter" | "release"

// 项目阶段接口返回数据库固定值；页面层只做中文显示，不再保留 qc / manuscript 别名。
export type ApiProjectStage = "synopsis" | "outline" | "chapter" | "release" | "completed"

// Doc 状态对外统一暴露 returned，内部 rejected 只保留在数据库和 Prisma 层。
export type ApiDocStatus = "draft" | "submitted" | "returned" | "approved"

// Doc 动作只保留当前仍然生效的业务动作；
// 旧设计里的“审核通过后重开作者编辑”已经取消，因此不再暴露 reopen 动作。
export type ApiDocAction =
  | "author_save"
  | "editor_save"
  | "author_submit"
  | "editor_return"
  | "editor_approve"

// Revision 历史动作与 Doc 动作类似，继续保持“退回”语义。
export type ApiRevisionAction = "author_submit" | "editor_return" | "editor_approve"

// 当前内容来源只有两种：活跃草稿或已通过后的最终 Revision。
export type DocSourceKind = "draft" | "final_revision"

// 当前稿件/最终版本都需要统一携带的内容投影字段，方便前端后续直接回填编辑器。
export interface DocContentSnapshot {
  contentSchemaVersion: number
  contentJson: Record<string, unknown>
  wordCount: number
  plainText: string | null
  cleanText: string | null
  exportText: string | null
  summary: string | null
  commentCount: number
  suggestionCount: number
  revisionMarkCount: number
}

// 当前活跃草稿视图会额外暴露乐观锁版本和当前持有人信息。
export interface DraftDocSource extends DocContentSnapshot {
  kind: "draft"
  draftId: string
  docId: string
  ownerRole: "author" | "editor"
  ownerUserId: string
  baseRevisionId: string | null
  lockVersion: number
  saveCount: number
  createdAt: string
  updatedAt: string
}

// 已通过后的当前视图会回退到最终 Revision，便于页面继续查看最终有效内容。
export interface FinalRevisionDocSource extends DocContentSnapshot {
  kind: "final_revision"
  revisionId: string
  docId: string
  revisionNo: number
  baseRevisionId: string | null
  fromDraftId: string
  action: ApiRevisionAction
  actorRole: "author" | "editor" | "admin"
  actorUserId: string
  actorName: string
  handoffNote: string | null
  contentHash: string | null
  createdAt: string
}

export type DocCurrentSource = DraftDocSource | FinalRevisionDocSource

// 当前用户在当前 Doc 上能做什么，由后端基于角色、持有人、阶段门禁统一给出。
export interface DocPermissions {
  canView: boolean
  canEditContent: boolean
  canSave: boolean
  canSubmit: boolean
  canReturn: boolean
  canApprove: boolean
  // 已定稿稿件允许编辑或管理员取消定稿，并重新生成作者可修改的活跃草稿。
  canCancelApproval: boolean
  canReadHistory: boolean
}

// 当前阶段计划状态也一并返回，方便前端后续直接展示门禁和截止时间。
export interface DocStagePlanSummary {
  stageCode: "synopsis" | "outline" | "chapter" | "release"
  gateStatus: "locked" | "unlocked" | "completed"
  timelineStatus: "not_started" | "in_progress" | "due_soon" | "overdue" | "completed"
  planDays: number
  unlockedAt: string | null
  startedAt: string | null
  dueAt: string | null
  completedAt: string | null
}

// Project 摘要只返回 Doc 接口真正需要的上下文，避免页面再去额外拼装归属关系。
export interface DocProjectSummary {
  projectId: string
  title: string
  editorId: string
  editorName: string
  authorId: string
  authorName: string
  lifecycleStatus: "draft" | "active" | "completed" | "archived" | "cancelled"
  currentStage: ApiProjectStage
  releaseStatus: "locked" | "unlocked" | "approved"
  docStagePlan: DocStagePlanSummary | null
}

// Doc 元信息保留数据库侧结构，但状态、动作按接口对外映射后的口径返回。
export interface DocMeta {
  docId: string
  projectId: string
  docType: ApiDocType
  stageCode: "synopsis" | "outline" | "chapter" | "release"
  title: string
  chapterNo: number | null
  sortOrder: number
  status: ApiDocStatus
  holderRole: "author" | "editor" | "none"
  activeDraftId: string | null
  latestRevisionId: string | null
  finalRevisionId: string | null
  currentWordCount: number
  currentPlainText: string | null
  currentCleanText: string | null
  summary: string | null
  lastAction: ApiDocAction | null
  lastActorId: string | null
  lastActorName: string | null
  lastActionAt: string | null
  lastHandoffNote: string | null
  submittedAt: string | null
  reviewedAt: string | null
  approvedAt: string | null
  createdAt: string
  updatedAt: string
}

// 当前视图 DTO 是 GET current 与四个写接口的统一响应体。
export interface DocCurrentView {
  doc: DocMeta
  source: DocCurrentSource
  permissions: DocPermissions
  project: DocProjectSummary
}

// Revision 列表项既保留链路信息，也给前端足够的时间轴展示字段。
export interface DocRevisionListItem {
  revisionId: string
  docId: string
  revisionNo: number
  baseRevisionId: string | null
  baseRevisionNo: number | null
  fromDraftId: string
  action: ApiRevisionAction
  actorRole: "author" | "editor" | "admin"
  actorUserId: string
  actorName: string
  handoffNote: string | null
  contentHash: string | null
  wordCount: number
  commentCount: number
  suggestionCount: number
  revisionMarkCount: number
  createdAt: string
  isFinal: boolean
}

// 历史列表接口返回 Doc 摘要、项目摘要和按时间倒序的 Revision 集合。
export interface DocRevisionListResponse {
  doc: DocMeta
  project: DocProjectSummary
  revisions: DocRevisionListItem[]
}

// 历史详情接口在列表项基础上补齐完整内容快照。
export interface DocRevisionDetail extends DocContentSnapshot {
  revisionId: string
  docId: string
  revisionNo: number
  baseRevisionId: string | null
  baseRevisionNo: number | null
  fromDraftId: string
  action: ApiRevisionAction
  actorRole: "author" | "editor" | "admin"
  actorUserId: string
  actorName: string
  handoffNote: string | null
  contentHash: string | null
  createdAt: string
  isFinal: boolean
  doc: DocMeta
  project: DocProjectSummary
}
