// 阅享平台 - 共享类型与状态定义
// 说明：
// 1. 这里统一维护“数据库、后端接口、前端页面”共用的基础枚举；
// 2. 项目阶段统一使用内部固定编码 synopsis / outline / chapter / release / completed；
// 3. 页面展示文案再把 release 翻译成“质检”，避免继续保留 qc / manuscript 这套旧别名。

export type Role = "admin" | "editor" | "author"

export const ROLE_LABELS: Record<Role, string> = {
  admin: "管理员",
  editor: "编辑",
  author: "作者",
}

// 用户状态
export type UserStatus = "active" | "disabled" | "pending" | "rejected"

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  active: "正常",
  disabled: "已禁用",
  pending: "待审批",
  rejected: "已驳回",
}

// SI 状态
export type SiStatus = "draft" | "prereleased" | "converted" | "archived"

export const SI_STATUS_LABELS: Record<SiStatus, string> = {
  draft: "草稿",
  prereleased: "预发中",
  converted: "已转项目",
  archived: "已归档",
}

// 项目生命周期
export type ProjectLifecycle = "draft" | "active" | "completed" | "archived" | "cancelled"

export const PROJECT_LIFECYCLE_LABELS: Record<ProjectLifecycle, string> = {
  draft: "草稿",
  active: "进行中",
  completed: "已完成",
  archived: "已归档",
  cancelled: "已取消",
}

// 项目阶段：
// 直接对齐数据库 ProjectStage 枚举，确保四层口径统一。
export type ProjectStage = "synopsis" | "outline" | "chapter" | "release" | "completed"

export const PROJECT_STAGE_LABELS: Record<ProjectStage, string> = {
  synopsis: "梗概",
  outline: "细纲",
  chapter: "正文",
  release: "质检",
  completed: "完成",
}

// Doc 状态
export type DocStatus = "draft" | "submitted" | "returned" | "approved"

export const DOC_STATUS_LABELS: Record<DocStatus, string> = {
  draft: "草稿",
  submitted: "已提交待审",
  returned: "退回待改",
  approved: "审核通过",
}

// 编辑权持有人
export type HolderRole = "author" | "editor" | "none"

export const HOLDER_ROLE_LABELS: Record<HolderRole, string> = {
  author: "作者",
  editor: "编辑",
  none: "无人",
}

// 阶段计划状态
export type StagePlanStatus = "not_started" | "in_progress" | "due_soon" | "overdue" | "completed"

export const STAGE_PLAN_STATUS_LABELS: Record<StagePlanStatus, string> = {
  not_started: "未开始",
  in_progress: "进行中",
  due_soon: "即将到期",
  overdue: "已逾期",
  completed: "已完成",
}

// 状态标签色彩语义
export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger"

export interface CurrentUser {
  id: string
  username: string
  name: string
  role: Role
  status: UserStatus
  email: string
  phone?: string
  // 管理员重置密码后，系统会强制用户先完成一次自助改密；
  // 前端据此在登录后立刻跳转到设置页，并阻止继续进入业务主链。
  passwordResetRequired?: boolean
}
