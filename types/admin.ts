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

// 运维页状态统一收敛成四种语义，前端再映射成现有 Badge 颜色。
export type OpsStatusTone = "ok" | "warning" | "danger" | "neutral"

// 概览指标用于展示业务量和运行量，不携带敏感字段，只返回可展示的字符串。
export interface OpsMetric {
  key: string
  label: string
  value: string
  hint?: string
  tone: OpsStatusTone
}

// 健康检查拆成数据库和运行时两块，便于页面快速定位是 DB 问题还是 Node 进程问题。
export interface OpsHealth {
  checkedAt: string
  database: {
    ok: boolean
    latencyMs: number | null
    message: string
  }
  runtime: {
    nodeEnv: string
    nodeVersion: string
    platform: string
    uptimeSeconds: number
  }
}

// 安全检查是只读诊断结果；真正的修复动作仍走单独 API，避免加载页面产生副作用。
export interface OpsSecurityCheck {
  key: string
  label: string
  status: OpsStatusTone
  detail: string
}

// 备份列表只暴露文件名、类型、大小和创建时间，不通过浏览器直接下载备份内容。
export interface OpsBackupItem {
  name: string
  type: "data" | "system"
  sizeBytes: number
  createdAt: string
}

// 运行日志只展示固定根目录下 .log 文件的尾部内容，后端会先做基础脱敏。
export interface OpsRuntimeLog {
  name: string
  sizeBytes: number
  updatedAt: string
  tail: string
}

// 清理预估只统计可以保守删除的运行辅助数据，不包含正文、版本、用户和项目。
export interface OpsCleanupPreview {
  expiredSessions: number
  oldReadNotifications: number
  oldClosedTodos: number
  oldExportJobs: number
}

// 运维总览是 /api/admin/ops 的完整响应结构，页面刷新时一次性读取。
export interface OpsOverview {
  health: OpsHealth
  metrics: OpsMetric[]
  securityChecks: OpsSecurityCheck[]
  backups: OpsBackupItem[]
  logs: OpsRuntimeLog[]
  cleanupPreview: OpsCleanupPreview
}

// 创建备份接口返回新生成的备份元数据，前端据此 toast 并刷新列表。
export interface OpsBackupResult {
  backup: OpsBackupItem
}

// 数据库清理接口返回各类记录的实际删除数量，便于管理员确认动作结果。
export interface OpsCleanupResult {
  deleted: {
    expiredSessions: number
    oldReadNotifications: number
    oldClosedTodos: number
    oldExportJobs: number
  }
}

// 日志截断接口返回截断后的日志状态，不返回旧日志正文。
export interface OpsLogTruncateResult {
  log: OpsRuntimeLog
}
