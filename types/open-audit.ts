import type { ProjectStage, Role } from "@/types/domain"

// Open API 审计日志沿用后台审计页已有的核心字段名，并补充外部统计需要的关联 ID 与阶段。
// system 只用于没有用户主体的系统日志，不会替代数据库中已经保存的真实用户角色快照。
export type OpenAuditActorRole = Role | "api" | "system"

export interface OpenAuditLogItem {
  id: string
  time: string
  operator: string
  operatorId: string | null
  role: OpenAuditActorRole
  action: string
  actionLabel: string
  target: string
  entityType: string
  entityId: string
  projectId: string
  projectTitle: string | null
  docId: string | null
  docTitle: string | null
  stage: ProjectStage | null
}

export interface OpenAuditActionOption {
  value: string
  label: string
}

// Route 层负责把外部字符串参数校验并转换为这里的强类型，Service 不再重复解释原始输入。
export interface OpenAuditLogListInput {
  page: number
  pageSize: number
  projectId: bigint | null
  docId: bigint | null
  actorId: bigint | null
  operator: string | null
  action: string | null
  startAt: Date | null
  endAt: Date | null
  updatedSince: Date | null
}

export interface OpenAuditLogListResult {
  logs: OpenAuditLogItem[]
  actions: OpenAuditActionOption[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}
