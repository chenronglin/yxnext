// 阅享平台 - 管理员治理相关 Mock 数据
import type { Role, UserStatus, BadgeTone } from "@/types/domain"

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
  lastLogin: string | null
  createdAt: string
}

export const MANAGED_USERS: ManagedUser[] = [
  { id: "u1", username: "admin", name: "平台管理员", role: "admin", status: "active", contact: "admin@yuexiang.com", lastLogin: "2026-06-09 08:30", createdAt: "2025-09-01" },
  { id: "u2", username: "editor_lin", name: "林编辑", role: "editor", status: "active", contact: "138****0002", lastLogin: "2026-06-09 09:12", createdAt: "2025-10-15" },
  { id: "u3", username: "editor_chen", name: "陈编辑", role: "editor", status: "active", contact: "138****0006", lastLogin: "2026-06-08 17:40", createdAt: "2025-11-02" },
  { id: "u4", username: "author_su", name: "苏小白", role: "author", status: "active", contact: "su@yuexiang.com", lastLogin: "2026-06-09 10:05", createdAt: "2026-01-08" },
  { id: "u5", username: "author_mo", name: "墨清欢", role: "author", status: "active", contact: "138****0008", lastLogin: "2026-06-07 14:20", createdAt: "2026-02-12" },
  { id: "u6", username: "author_jiang", name: "江临", role: "author", status: "disabled", contact: "jiang@yuexiang.com", lastLogin: "2026-05-20 11:00", createdAt: "2026-03-01" },
  { id: "u7", username: "author_qin", name: "秦书", role: "author", status: "active", contact: "138****0010", lastLogin: "2026-06-06 09:30", createdAt: "2026-04-18" },
]

// 作者注册审批
export interface ApprovalRequest {
  id: string
  username: string
  penName: string
  contact: string
  appliedAt: string
  note: string
  status: "pending" | "rejected"
  rejectReason?: string
}

export const APPROVAL_REQUESTS: ApprovalRequest[] = [
  { id: "ap1", username: "newauthor_01", penName: "云中歌", contact: "yun@example.com", appliedAt: "2026-06-08 15:20", note: "擅长古风言情，有三本完结作品。", status: "pending" },
  { id: "ap2", username: "newauthor_02", penName: "夜航船", contact: "138****1234", appliedAt: "2026-06-07 11:10", note: "悬疑推理方向，希望加入平台。", status: "pending" },
  { id: "ap3", username: "newauthor_03", penName: "白羽", contact: "bai@example.com", appliedAt: "2026-06-05 09:40", note: "科幻题材新人作者。", status: "pending" },
  { id: "ap4", username: "spam_user", penName: "测试账号", contact: "test@example.com", appliedAt: "2026-06-02 18:00", note: "—", status: "rejected", rejectReason: "申请信息不完整，疑似无效申请。" },
]

// 编辑-作者绑定
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

export const BINDINGS: Binding[] = [
  { id: "b1", editor: "林编辑", editorId: "e1", author: "苏小白", authorId: "a1", status: "active", createdAt: "2026-01-08", operator: "平台管理员" },
  { id: "b2", editor: "林编辑", editorId: "e1", author: "墨清欢", authorId: "a2", status: "active", createdAt: "2026-02-12", operator: "平台管理员" },
  { id: "b3", editor: "陈编辑", editorId: "e2", author: "苏小白", authorId: "a1", status: "active", createdAt: "2026-05-15", operator: "平台管理员" },
  { id: "b4", editor: "陈编辑", editorId: "e2", author: "江临", authorId: "a3", status: "inactive", createdAt: "2026-03-01", operator: "平台管理员" },
]

// 业务参数（SI 主类型）
export interface SysParam {
  id: string
  name: string
  value: string
  status: "active" | "inactive"
  order: number
  createdAt: string
}

export const SI_MAIN_TYPE_PARAMS: SysParam[] = [
  { id: "pm1", name: "玄幻奇幻", value: "fantasy", status: "active", order: 1, createdAt: "2025-09-01" },
  { id: "pm2", name: "都市现实", value: "urban", status: "active", order: 2, createdAt: "2025-09-01" },
  { id: "pm3", name: "历史古代", value: "history", status: "active", order: 3, createdAt: "2025-09-01" },
  { id: "pm4", name: "科幻末世", value: "scifi", status: "active", order: 4, createdAt: "2025-09-01" },
  { id: "pm5", name: "悬疑推理", value: "mystery", status: "active", order: 5, createdAt: "2025-10-10" },
  { id: "pm6", name: "游戏竞技", value: "game", status: "inactive", order: 6, createdAt: "2025-11-20" },
]

// 操作日志 / 审计
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

export const AUDIT_LOGS: AuditLog[] = [
  { id: "log1", time: "2026-06-09 10:20", operator: "林编辑", role: "editor", action: "审核通过", target: "Doc：第三章", before: "已提交待审", after: "审核通过", note: "节奏不错" },
  { id: "log2", time: "2026-06-08 18:45", operator: "林编辑", role: "editor", action: "退回", target: "Doc：第五章", before: "已提交待审", after: "退回待改", note: "中段冲突偏弱" },
  { id: "log3", time: "2026-06-08 09:30", operator: "苏小白", role: "author", action: "提交审核", target: "Doc：第四章", before: "草稿", after: "已提交待审", note: "—" },
  { id: "log4", time: "2026-06-07 14:00", operator: "平台管理员", role: "admin", action: "归属调整", target: "项目：星海拾遗", before: "负责编辑 林编辑", after: "负责编辑 陈编辑", note: "工作量调整" },
  { id: "log5", time: "2026-06-05 16:10", operator: "平台管理员", role: "admin", action: "用户禁用", target: "用户：江临", before: "正常", after: "已禁用", note: "长期未活跃" },
  { id: "log6", time: "2026-06-02 11:30", operator: "平台管理员", role: "admin", action: "项目取消", target: "项目：雾隐山庄", before: "进行中", after: "已取消", note: "选题方向调整" },
  { id: "log7", time: "2026-05-30 09:00", operator: "陈编辑", role: "editor", action: "解锁全文质检", target: "项目：山海食肆", before: "未解锁", after: "已解锁", note: "全部章节通过" },
]

export const AUDIT_ACTIONS = ["保存", "提交审核", "退回", "审核通过", "归属调整", "项目归档", "项目取消", "项目恢复", "用户禁用", "用户启用", "解锁全文质检"]
