import type { BadgeTone, Role, UserStatus } from "@/types/domain"

export const USER_STATUS_TONE: Record<UserStatus, BadgeTone> = {
  active: "success",
  disabled: "danger",
  pending: "warning",
  rejected: "neutral",
}

export const ROLE_TONE: Record<Role, BadgeTone> = {
  admin: "info",
  editor: "info",
  author: "neutral",
}

export interface ManagedUser {
  id: string
  username: string
  name: string
  role: Role
  status: UserStatus
  contact: string
  email: string
  phone?: string
  biography?: string
  lastLogin: string | null
  createdAt: string
}

export interface ApprovalRequest {
  id: string
  username: string
  penName: string
  contact: string
  appliedAt: string
  note: string
  biography: string
  status: "pending" | "rejected"
  rejectReason?: string
}

export interface Binding {
  id: string
  editor: string
  editorId: string
  author: string
  authorId: string
  status: "active" | "inactive"
  createdAt: string
  operator: string
}

export interface SysParam {
  id: string
  name: string
  value: string
  status: "active" | "inactive"
  order: number
  createdAt: string
}

export interface StagePlanDefaultItem {
  // 阶段参数直接复用数据库真实编码，避免继续暴露旧版 manuscript / qc 别名。
  stage: "synopsis" | "outline" | "chapter" | "release"
  label: string
  days: number
  warningDaysBeforeDue: number
  updatedAt: string
}

export interface AuditLog {
  id: string
  time: string
  operator: string
  role: Role
  action: string
  target: string
  before: string
  after: string
  note: string
}

export interface DashboardStats {
  userTotal: number
  editorTotal: number
  authorTotal: number
  projectTotal: number
  completedProjectTotal: number
  overdueProjectTotal: number
  todaySubmitCount: number
  todayReviewCount: number
  todayReturnCount: number
  stageCounts: Array<{
    // 管理看板里的阶段统计也统一改成数据库真实编码。
    stage: "synopsis" | "outline" | "chapter" | "release" | "completed"
    count: number
  }>
  authorRanking: Array<{
    name: string
    value: string
  }>
  editorRanking: Array<{
    name: string
    value: string
  }>
  pendingApprovalCount: number
}

export interface AdminReportStats {
  userCount: number
  projectTotal: number
  completedProjectTotal: number
  overdueProjectTotal: number
  totalSubmittedWords: number
  todaySubmitCount: number
  todayReviewCount: number
  todayReturnCount: number
  stageCounts: Array<{
    label: string
    value: number
  }>
  authorRanking: Array<{
    name: string
    value: string
  }>
  editorRanking: Array<{
    name: string
    value: string
  }>
}
