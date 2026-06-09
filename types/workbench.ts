import type { BadgeTone, Role } from "@/types/domain"
import type { DashboardStats, AdminReportStats } from "@/types/admin"

// 审稿工作台列表需要同时展示项目、Doc、作者和提交摘要，
// 因此这里把页面真正消费的字段收成一个稳定对象，避免前端直接拼 Prisma 结构。
export interface ReviewQueueItem {
  docId: string
  projectId: string
  projectTitle: string
  // 审稿队列直接返回数据库真实 Doc 类型，前端只再做中文文案映射。
  docType: "synopsis" | "outline" | "chapter" | "release"
  title: string
  authorName: string
  words: number
  submittedAt: string | null
  submitNote: string
  previewText: string
  previousPreviewText: string | null
  dueAt: string | null
}

// 待办页的筛选标签和当前前端页面保持一致，服务端直接返回统一 type，
// 这样页面后续切换到真实接口时不需要再重新定义分类逻辑。
export type TodoType = "si" | "review" | "returned" | "warning" | "overdue" | "approval"

export interface TodoItemView {
  id: string
  type: TodoType
  title: string
  relatedType: string
  relatedName: string
  status: string
  statusTone: BadgeTone
  due: string
  from: string
  createdAt: string
  // 待办的“已读/未读”与“业务完成状态”彻底解耦，因此单独返回 read/readAt。
  read: boolean
  readAt: string | null
  href: string
}

// 通知中心既要保留数据库里的原始 type，方便后端继续扩展，
// 又要给前端一个稳定的分类 category，方便统一展示标签文案。
export type NotificationCategory =
  | "si_prerelease"
  | "si_convert"
  | "doc_submit"
  | "doc_approve"
  | "doc_return"
  | "stage_unlock"
  | "enter_qc"
  | "project_done"
  | "stage_warning"
  | "binding_change"
  | "approval_result"
  | "approval_request"
  | "forgot_password_request"
  | "system"

export interface NotificationItemView {
  id: string
  rawType: string
  category: NotificationCategory
  title: string
  detail: string
  time: string
  read: boolean
  href: string
}

// 编辑看板只覆盖当前界面真正展示的统计卡片与最近处理记录；
// 后续如果报表页需要更多字段，再在独立的报表类型里扩展。
export interface EditorDashboardStats {
  responsibleProjectTotal: number
  pendingReviewDocTotal: number
  returnedDocTotal: number
  dueSoonProjectTotal: number
  overdueProjectTotal: number
  siDraftTotal: number
  siPrereleasedTotal: number
  recentActivities: Array<{
    title: string
    action: string
    tone: BadgeTone
    time: string
  }>
}

export interface AuthorDashboardStats {
  projectTotal: number
  draftDocTotal: number
  returnedDocTotal: number
  pendingSubmitDocTotal: number
  recentSubmitCount: number
  totalWordCount: number
  recentSubmissions: Array<{
    title: string
    action: string
    tone: BadgeTone
    time: string
  }>
}

// 报表页与看板页虽然来源相近，但展示方式不同：
// 报表页更偏“汇总 + 排行 + 最近记录”，所以单独定义结构，避免前端靠 dashboard 数据二次推导。
export interface EditorReportStats {
  projectTotal: number
  pendingReviewDocTotal: number
  returnedDocTotal: number
  dueSoonProjectTotal: number
  overdueProjectTotal: number
  recentActivities: Array<{
    name: string
    value: string
  }>
}

export interface AuthorReportStats {
  projectTotal: number
  draftOrReturnedDocTotal: number
  returnedDocTotal: number
  recentSubmitCount: number
  totalWordCount: number
  recentSubmissions: Array<{
    name: string
    value: string
  }>
}

// 统一的角色化看板响应；管理员仍然复用现有 DashboardStats，
// 编辑和作者则走当前新补的真实统计结构。
export type WorkspaceDashboardPayload =
  | {
      role: "admin"
      stats: DashboardStats
    }
  | {
      role: "editor"
      stats: EditorDashboardStats
    }
  | {
      role: "author"
      stats: AuthorDashboardStats
    }

// 报表接口同理：管理员沿用现有后台报表结构，编辑和作者返回各自的报表 DTO。
export type WorkspaceReportPayload =
  | {
      role: "admin"
      stats: AdminReportStats
    }
  | {
      role: "editor"
      stats: EditorReportStats
    }
  | {
      role: "author"
      stats: AuthorReportStats
    }

// 角色化响应里显式带 role，是为了让前端在一个统一 endpoint 下也能安全分流渲染。
export interface RoleScopedResponse<T> {
  role: Role
  data: T
}
