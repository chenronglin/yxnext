import type { Locale } from "@/lib/i18n/config"
import type { I18nKey } from "@/lib/i18n/dictionary"

// 阅享平台 - 共享类型与状态定义
// 说明：
// 1. 这里统一维护“数据库、后端接口、前端页面”共用的基础枚举；
// 2. 业务枚举仍然只保存稳定 code，展示文案统一交给 i18n 字典；
// 3. 项目阶段继续使用 synopsis / outline / chapter / release / completed，避免接口层再出现旧别名。

export type Role = "admin" | "editor" | "author"

export const ROLE_LABEL_KEYS: Record<Role, I18nKey> = {
  admin: "domain.role.admin",
  editor: "domain.role.editor",
  author: "domain.role.author",
}

// 用户状态
export type UserStatus = "active" | "disabled" | "pending" | "rejected"

export const USER_STATUS_LABEL_KEYS: Record<UserStatus, I18nKey> = {
  active: "domain.userStatus.active",
  disabled: "domain.userStatus.disabled",
  pending: "domain.userStatus.pending",
  rejected: "domain.userStatus.rejected",
}

// SI 状态
export type SiStatus = "draft" | "prereleased" | "converted" | "archived"

export const SI_STATUS_LABEL_KEYS: Record<SiStatus, I18nKey> = {
  draft: "domain.siStatus.draft",
  prereleased: "domain.siStatus.prereleased",
  converted: "domain.siStatus.converted",
  archived: "domain.siStatus.archived",
}

// 项目生命周期
export type ProjectLifecycle = "draft" | "active" | "completed" | "archived" | "cancelled"

export const PROJECT_LIFECYCLE_LABEL_KEYS: Record<ProjectLifecycle, I18nKey> = {
  draft: "domain.projectLifecycle.draft",
  active: "domain.projectLifecycle.active",
  completed: "domain.projectLifecycle.completed",
  archived: "domain.projectLifecycle.archived",
  cancelled: "domain.projectLifecycle.cancelled",
}

// 项目阶段：
// 直接对齐数据库 ProjectStage 枚举，确保四层口径统一。
export type ProjectStage = "synopsis" | "outline" | "chapter" | "release" | "completed"

export const PROJECT_STAGE_LABEL_KEYS: Record<ProjectStage, I18nKey> = {
  synopsis: "domain.projectStage.synopsis",
  outline: "domain.projectStage.outline",
  chapter: "domain.projectStage.chapter",
  release: "domain.projectStage.release",
  completed: "domain.projectStage.completed",
}

// Doc 状态
export type DocStatus = "draft" | "submitted" | "returned" | "approved"

export const DOC_STATUS_LABEL_KEYS: Record<DocStatus, I18nKey> = {
  draft: "domain.docStatus.draft",
  submitted: "domain.docStatus.submitted",
  returned: "domain.docStatus.returned",
  approved: "domain.docStatus.approved",
}

// 编辑权持有人
export type HolderRole = "author" | "editor" | "none"

export const HOLDER_ROLE_LABEL_KEYS: Record<HolderRole, I18nKey> = {
  author: "domain.holderRole.author",
  editor: "domain.holderRole.editor",
  none: "domain.holderRole.none",
}

// 阶段计划状态
export type StagePlanStatus = "not_started" | "in_progress" | "due_soon" | "overdue" | "completed"

export const STAGE_PLAN_STATUS_LABEL_KEYS: Record<StagePlanStatus, I18nKey> = {
  not_started: "domain.stagePlan.not_started",
  in_progress: "domain.stagePlan.in_progress",
  due_soon: "domain.stagePlan.due_soon",
  overdue: "domain.stagePlan.overdue",
  completed: "domain.stagePlan.completed",
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
  preferredLocale: Locale
  // 管理员重置密码后，系统会强制用户先完成一次自助改密；
  // 前端据此在登录后立刻跳转到设置页，并阻止继续进入业务主链。
  passwordResetRequired?: boolean
}
