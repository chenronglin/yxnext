import "server-only"

import { Prisma } from "@prisma/client"

import { formatAuditAction } from "@/lib/audit-log"
import { prisma } from "@/server/db/prisma"
import type {
  OpenAuditActorRole,
  OpenAuditLogItem,
  OpenAuditLogListInput,
  OpenAuditLogListResult,
} from "@/types/open-audit"
import type { ProjectStage } from "@/types/domain"

const PROJECT_STAGES = new Set<ProjectStage>(["synopsis", "outline", "chapter", "release", "completed"])
const ACTOR_ROLES = new Set<OpenAuditActorRole>(["admin", "editor", "author", "system"])

// 对外审计日志只查询项目统计所需字段，不暴露 IP、User-Agent、请求 ID 或变更前后正文相关 JSON。
const openAuditInclude = {
  actor: {
    select: {
      username: true,
      displayName: true,
      role: true,
    },
  },
  project: {
    select: {
      title: true,
    },
  },
  doc: {
    select: {
      title: true,
      stageCode: true,
    },
  },
} satisfies Prisma.OperationLogInclude

type OpenAuditRecord = Prisma.OperationLogGetPayload<{ include: typeof openAuditInclude }>

function userName(user: { username: string; displayName: string | null }) {
  return user.displayName ?? user.username
}

function jsonRecord(value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, Prisma.JsonValue>
}

function stageFromJson(value: Prisma.JsonValue | null, keys: string[]): ProjectStage | null {
  const record = jsonRecord(value)
  if (!record) return null

  for (const key of keys) {
    const candidate = record[key]
    if (typeof candidate === "string" && PROJECT_STAGES.has(candidate as ProjectStage)) {
      return candidate as ProjectStage
    }
  }

  return null
}

function actionStage(action: string): ProjectStage | null {
  // 少数项目级日志没有阶段快照；只有动作编码本身能够无歧义确定阶段时才使用固定映射。
  // 无法可靠判断的项目管理动作返回 null，避免把项目“当前阶段”伪装成历史操作发生阶段。
  if (action.startsWith("project.chapter.")) return "chapter"
  if (action === "project.qc.unlock" || action === "project.qc.regenerate") return "release"
  return null
}

function auditStage(log: OpenAuditRecord): ProjectStage | null {
  // Doc 的 stageCode 是所属业务阶段的稳定字段，也是文档保存、提交、打回、通过等统计的首选来源。
  if (log.doc?.stageCode) return log.doc.stageCode

  return (
    stageFromJson(log.metadataJson, ["stage", "projectStage", "currentStage", "nextProjectStage"]) ??
    stageFromJson(log.beforeJson, ["projectStage", "currentStage", "stage"]) ??
    stageFromJson(log.afterJson, ["projectStage", "currentStage", "nextProjectStage", "stage"]) ??
    actionStage(log.action)
  )
}

function auditRole(log: OpenAuditRecord): OpenAuditActorRole {
  // actorRole 是写日志时保存的角色快照，比用户账号当前角色更能代表历史操作语义。
  const snapshotRole = log.actorRole
  if (snapshotRole && ACTOR_ROLES.has(snapshotRole as OpenAuditActorRole)) {
    return snapshotRole as OpenAuditActorRole
  }

  return log.actor?.role ?? "system"
}

function auditOperator(log: OpenAuditRecord) {
  if (log.actor) return userName(log.actor)
  return log.actorRole ? "已删除用户" : "系统"
}

function auditTarget(log: OpenAuditRecord) {
  if (log.doc) {
    const projectPrefix = log.project ? `项目：${log.project.title} · ` : ""
    return `${projectPrefix}Doc：${log.doc.title}`
  }

  if (log.project) return `项目：${log.project.title}`
  return `${log.entityType}：${log.entityId.toString()}`
}

function toOpenAuditLog(log: OpenAuditRecord): OpenAuditLogItem {
  // Service 的可见范围强制 projectId 非空；这里保留显式检查，避免未来查询条件被改动后静默破坏契约。
  if (log.projectId === null) {
    throw new Error("Open Audit Log 缺少 projectId")
  }

  return {
    id: log.logId.toString(),
    time: log.createdAt.toISOString(),
    operator: auditOperator(log),
    operatorId: log.actorUserId?.toString() ?? null,
    role: auditRole(log),
    action: log.action,
    actionLabel: formatAuditAction(log.action),
    target: auditTarget(log),
    entityType: log.entityType,
    entityId: log.entityId.toString(),
    projectId: log.projectId.toString(),
    projectTitle: log.project?.title ?? null,
    docId: log.docId?.toString() ?? null,
    docTitle: log.doc?.title ?? null,
    stage: auditStage(log),
  }
}

function createdAtFilter(input: OpenAuditLogListInput): Prisma.DateTimeFilter | undefined {
  if (!input.startAt && !input.endAt && !input.updatedSince) return undefined

  return {
    // updatedSince 是严格增量边界；startAt/endAt 是普通报表时间范围，分别包含边界值。
    ...(input.updatedSince ? { gt: input.updatedSince } : {}),
    ...(input.startAt ? { gte: input.startAt } : {}),
    ...(input.endAt ? { lte: input.endAt } : {}),
  }
}

function auditWhere(input: OpenAuditLogListInput): Prisma.OperationLogWhereInput {
  const createdAt = createdAtFilter(input)

  return {
    // 外部接口只暴露与项目关联的操作日志，避免泄露账号审批、密码重置和系统运维等后台审计信息。
    projectId: input.projectId ?? { not: null },
    ...(input.docId ? { docId: input.docId } : {}),
    ...(input.actorId ? { actorUserId: input.actorId } : {}),
    ...(input.action && input.action !== "all" ? { action: input.action } : {}),
    ...(input.operator
      ? {
          actor: {
            OR: [
              { displayName: { contains: input.operator } },
              { username: { contains: input.operator } },
            ],
          },
        }
      : {}),
    ...(createdAt ? { createdAt } : {}),
  }
}

export async function listOpenAuditLogs(input: OpenAuditLogListInput): Promise<OpenAuditLogListResult> {
  const where = auditWhere(input)
  const skip = (input.page - 1) * input.pageSize
  const orderBy: Prisma.OperationLogOrderByWithRelationInput[] = input.updatedSince
    ? [{ createdAt: "asc" }, { logId: "asc" }]
    : [{ createdAt: "desc" }, { logId: "desc" }]

  // 日志、总数和动作选项在同一事务快照内读取，确保分页元数据与当前结果集一致。
  return prisma.$transaction(async (tx) => {
    const [logs, total, actionGroups] = await Promise.all([
      tx.operationLog.findMany({
        where,
        include: openAuditInclude,
        orderBy,
        skip,
        take: input.pageSize,
      }),
      tx.operationLog.count({ where }),
      // 动作选项只受 Open API 的项目日志可见范围约束，不随当前筛选收缩，便于调用方构建固定筛选器。
      tx.operationLog.groupBy({
        by: ["action"],
        where: {
          projectId: {
            not: null,
          },
        },
        orderBy: {
          action: "asc",
        },
      }),
    ])

    return {
      logs: logs.map(toOpenAuditLog),
      actions: actionGroups.map((item) => ({
        value: item.action,
        label: formatAuditAction(item.action),
      })),
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
    }
  })
}
