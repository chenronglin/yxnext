import "server-only"

import { createHash, randomBytes } from "crypto"
import { mkdir, open, readdir, readFile, stat, truncate, writeFile } from "fs/promises"
import path from "path"

import { Prisma } from "@prisma/client"

import { cleanupExpiredUserSessions } from "@/server/auth/session"
import { prisma } from "@/server/db/prisma"
import { ApiError } from "@/server/shared/api-response"
import { assertRole } from "@/server/shared/current-user"
import type { ApiCurrentUser } from "@/server/shared/current-user"
import type {
  OpsBackupItem,
  OpsBackupResult,
  OpsCleanupPreview,
  OpsCleanupResult,
  OpsHealth,
  OpsOverview,
  OpsRuntimeLog,
  OpsSecurityCheck,
} from "@/types/admin"

type CleanupRetentionInput = {
  readNotificationDays?: number
  closedTodoDays?: number
  exportJobDays?: number
}

type TruncateLogInput = {
  fileName?: string
}

type BackupType = OpsBackupItem["type"]

// 运维文件只能写入项目根目录下的固定 backups 目录，避免管理员接口被误用成任意文件写入能力。
const PROJECT_ROOT = path.resolve(/*turbopackIgnore: true*/ process.cwd())
const BACKUP_ROOT = path.join(/*turbopackIgnore: true*/ PROJECT_ROOT, "backups")
const DATA_BACKUP_DIR = path.join(BACKUP_ROOT, "data")
const SYSTEM_BACKUP_DIR = path.join(BACKUP_ROOT, "system")

// 日志管理只允许处理项目根目录下的 .log 文件，避免通过路径穿越读取或截断业务代码、环境文件。
const LOG_FILE_PATTERN = /^[a-zA-Z0-9._-]+\.log$/
const LOG_TAIL_BYTES = 64 * 1024

// 清理动作默认保守：只处理已经读、已经关闭或已经结束的记录，不碰核心业务正文、版本和审计数据。
const DEFAULT_READ_NOTIFICATION_RETENTION_DAYS = 180
const DEFAULT_CLOSED_TODO_RETENTION_DAYS = 180
const DEFAULT_EXPORT_JOB_RETENTION_DAYS = 90

// 系统备份只生成“可校验清单”，不复制源码全文和 .env，降低备份文件泄露时的敏感信息风险。
const SYSTEM_MANIFEST_DIRS = [
  "app",
  "components",
  "config",
  "hooks",
  "lib",
  "server",
  "types",
  "prisma/migrations",
  "scripts",
]

const SYSTEM_MANIFEST_FILES = [
  "package.json",
  "pnpm-lock.yaml",
  "next.config.mjs",
  "tsconfig.json",
  "prisma/schema.prisma",
  "nginx_deploy.conf",
  ".env.example",
]

function ensureAdmin(actor: ApiCurrentUser) {
  assertRole(actor, ["admin"])
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

function normalizeRetentionDays(value: number | undefined, fallback: number) {
  // 运维页面传入的保留天数需要有上下限，避免误传 0 天导致刚产生的记录被立即删除。
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback
  }

  return Math.min(3650, Math.max(7, Math.trunc(value)))
}

function timestampSlug(date = new Date()) {
  // 文件名使用 UTC 时间，排查跨时区服务器时不会和本地显示时间混淆。
  return date.toISOString().replace(/[:.]/g, "-")
}

function backupDirectoryByType(type: BackupType) {
  return type === "data" ? DATA_BACKUP_DIR : SYSTEM_BACKUP_DIR
}

async function ensureBackupDirectories() {
  await Promise.all([
    mkdir(DATA_BACKUP_DIR, { recursive: true }),
    mkdir(SYSTEM_BACKUP_DIR, { recursive: true }),
  ])
}

function jsonStringifyForBackup(value: unknown) {
  // Prisma 返回的 BigInt 不能直接 JSON.stringify；统一转成字符串，恢复时再按 schema 转回数字 ID。
  return JSON.stringify(
    value,
    (_key, item) => {
      if (typeof item === "bigint") {
        return item.toString()
      }

      return item
    },
    2,
  )
}

async function writeJsonBackup(type: BackupType, prefix: string, payload: unknown): Promise<OpsBackupItem> {
  await ensureBackupDirectories()

  const directory = backupDirectoryByType(type)
  const fileName = `${prefix}-${timestampSlug()}-${randomBytes(4).toString("hex")}.json`
  const filePath = path.join(/*turbopackIgnore: true*/ directory, fileName)

  await writeFile(/*turbopackIgnore: true*/ filePath, `${jsonStringifyForBackup(payload)}\n`, "utf8")

  const fileStat = await stat(/*turbopackIgnore: true*/ filePath)

  return {
    name: fileName,
    type,
    sizeBytes: fileStat.size,
    createdAt: fileStat.birthtime.toISOString(),
  }
}

async function listBackupFilesByType(type: BackupType) {
  await ensureBackupDirectories()

  const directory = backupDirectoryByType(type)
  const names = await readdir(/*turbopackIgnore: true*/ directory).catch(() => [])
  const items = await Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .map(async (name): Promise<OpsBackupItem | null> => {
        const filePath = path.join(/*turbopackIgnore: true*/ directory, name)
        const fileStat = await stat(/*turbopackIgnore: true*/ filePath).catch(() => null)

        if (!fileStat?.isFile()) {
          return null
        }

        return {
          name,
          type,
          sizeBytes: fileStat.size,
          createdAt: fileStat.birthtime.toISOString(),
        }
      }),
  )

  return items.filter((item): item is OpsBackupItem => Boolean(item))
}

async function listRecentBackups() {
  const backups = await Promise.all([listBackupFilesByType("data"), listBackupFilesByType("system")])

  return backups
    .flat()
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 20)
}

function redactLogLine(line: string) {
  // 日志尾部只用于定位运行问题，展示前做基础脱敏，避免数据库连接串或 Cookie 值直接出现在页面。
  return line
    .replace(/(DATABASE_URL\s*=\s*)\S+/gi, "$1[已隐藏]")
    .replace(/(password|passwd|pwd|secret|token|cookie)(["'\s:=]+)([^"'\s]+)/gi, "$1$2[已隐藏]")
}

async function readLogTail(filePath: string) {
  const fileStat = await stat(/*turbopackIgnore: true*/ filePath)
  const start = Math.max(0, fileStat.size - LOG_TAIL_BYTES)
  const length = fileStat.size - start
  const buffer = Buffer.alloc(length)
  const handle = await open(/*turbopackIgnore: true*/ filePath, "r")

  try {
    // 日志文件可能很大，只读取末尾固定字节，避免打开运维页时把整份日志读入内存。
    await handle.read(buffer, 0, length, start)
  } finally {
    await handle.close()
  }

  const tail = buffer.toString("utf8")

  return tail
    .split(/\r?\n/)
    .slice(-80)
    .map(redactLogLine)
    .join("\n")
}

async function listRuntimeLogs(): Promise<OpsRuntimeLog[]> {
  const names = await readdir(/*turbopackIgnore: true*/ PROJECT_ROOT).catch(() => [])
  const items = await Promise.all(
    names
      .filter((name) => LOG_FILE_PATTERN.test(name))
      .map(async (name): Promise<OpsRuntimeLog | null> => {
        const filePath = path.join(/*turbopackIgnore: true*/ PROJECT_ROOT, name)
        const fileStat = await stat(/*turbopackIgnore: true*/ filePath).catch(() => null)

        if (!fileStat?.isFile()) {
          return null
        }

        return {
          name,
          sizeBytes: fileStat.size,
          updatedAt: fileStat.mtime.toISOString(),
          tail: fileStat.size > 0 ? await readLogTail(filePath) : "",
        }
      }),
  )

  return items
    .filter((item): item is OpsRuntimeLog => Boolean(item))
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
}

function makeSafeLogPath(fileName: string | undefined) {
  if (!fileName || !LOG_FILE_PATTERN.test(fileName)) {
    throw new ApiError({
      status: 400,
      code: "INVALID_LOG_FILE",
      message: "日志文件名不合法",
    })
  }

  const filePath = path.join(/*turbopackIgnore: true*/ PROJECT_ROOT, fileName)
  const relative = path.relative(PROJECT_ROOT, filePath)

  // 双重校验相对路径，防止类似 ../app.log 的路径穿越绕过文件名检查。
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new ApiError({
      status: 400,
      code: "INVALID_LOG_FILE",
      message: "日志文件路径不合法",
    })
  }

  return filePath
}

async function writeOpsLog(actor: ApiCurrentUser, action: string, metadataJson?: Prisma.InputJsonValue) {
  // 运维操作写入 operation_logs，entity_id 使用 0 表示系统级动作，不绑定具体业务对象。
  await prisma.operationLog.create({
    data: {
      actorUserId: actor.userId,
      actorRole: actor.role,
      action,
      entityType: "system",
      entityId: 0n,
      metadataJson,
    },
  })
}

async function getDatabaseHealth(): Promise<OpsHealth["database"]> {
  const startedAt = Date.now()

  try {
    await prisma.$queryRaw`SELECT 1`

    return {
      ok: true,
      latencyMs: Date.now() - startedAt,
      message: "数据库连接正常",
    }
  } catch (error) {
    return {
      ok: false,
      latencyMs: null,
      message: error instanceof Error ? error.message : "数据库连接失败",
    }
  }
}

async function getCleanupPreview(): Promise<OpsCleanupPreview> {
  const now = new Date()

  const [expiredSessions, oldReadNotifications, oldClosedTodos, oldExportJobs] = await Promise.all([
    prisma.userSession.count({
      where: {
        OR: [
          {
            expiresAt: {
              lt: now,
            },
          },
          {
            revokedAt: {
              not: null,
            },
          },
        ],
      },
    }),
    prisma.notification.count({
      where: {
        isRead: true,
        createdAt: {
          lt: daysAgo(DEFAULT_READ_NOTIFICATION_RETENTION_DAYS),
        },
      },
    }),
    prisma.todoItem.count({
      where: {
        status: {
          in: ["done", "cancelled"],
        },
        updatedAt: {
          lt: daysAgo(DEFAULT_CLOSED_TODO_RETENTION_DAYS),
        },
      },
    }),
    prisma.exportJob.count({
      where: {
        status: {
          in: ["completed", "failed"],
        },
        createdAt: {
          lt: daysAgo(DEFAULT_EXPORT_JOB_RETENTION_DAYS),
        },
      },
    }),
  ])

  return {
    expiredSessions,
    oldReadNotifications,
    oldClosedTodos,
    oldExportJobs,
  }
}

async function buildSecurityChecks(input: {
  databaseOk: boolean
  expiredSessions: number
  latestDataBackup: OpsBackupItem | undefined
}): Promise<OpsSecurityCheck[]> {
  const [activeAdminCount, pendingPasswordResetCount] = await Promise.all([
    prisma.user.count({
      where: {
        role: "admin",
        status: "active",
      },
    }),
    prisma.user.count({
      where: {
        passwordResetRequired: true,
        status: "active",
      },
    }),
  ])

  const secureCookieConfigured = process.env.SESSION_COOKIE_SECURE?.trim().toLowerCase()
  const secureCookieDisabled = ["false", "0", "no", "off"].includes(secureCookieConfigured ?? "")
  const latestBackupAgeMs = input.latestDataBackup
    ? Date.now() - new Date(input.latestDataBackup.createdAt).getTime()
    : Number.POSITIVE_INFINITY

  return [
    {
      key: "database",
      label: "数据库连通性",
      status: input.databaseOk ? "ok" : "danger",
      detail: input.databaseOk ? "当前请求可以访问数据库" : "数据库健康检查失败",
    },
    {
      key: "sessionCookie",
      label: "会话 Cookie",
      status: process.env.NODE_ENV === "production" && secureCookieDisabled ? "danger" : "ok",
      detail:
        process.env.NODE_ENV === "production" && secureCookieDisabled
          ? "生产环境不应关闭 Secure Cookie"
          : "会话 Cookie 使用 HttpOnly、SameSite=Lax，并按环境启用 Secure",
    },
    {
      key: "activeAdmins",
      label: "管理员冗余",
      status: activeAdminCount > 1 ? "ok" : activeAdminCount === 1 ? "warning" : "danger",
      detail:
        activeAdminCount > 1
          ? `当前有 ${activeAdminCount} 个活动管理员`
          : activeAdminCount === 1
            ? "当前只有 1 个活动管理员，建议至少保留 2 个"
            : "没有活动管理员账号",
    },
    {
      key: "cronSecret",
      label: "定时任务密钥",
      status: process.env.CRON_SECRET ? "ok" : "warning",
      detail: process.env.CRON_SECRET ? "CRON_SECRET 已配置" : "CRON_SECRET 未配置，定时接口需要额外保护",
    },
    {
      key: "expiredSessions",
      label: "过期会话",
      status: input.expiredSessions > 0 ? "warning" : "ok",
      detail: input.expiredSessions > 0 ? `发现 ${input.expiredSessions} 条可清理会话` : "没有待清理会话",
    },
    {
      key: "passwordReset",
      label: "强制改密",
      status: pendingPasswordResetCount > 0 ? "warning" : "ok",
      detail:
        pendingPasswordResetCount > 0
          ? `${pendingPasswordResetCount} 个用户仍需完成强制改密`
          : "没有待强制改密用户",
    },
    {
      key: "recentBackup",
      label: "最近数据备份",
      status: latestBackupAgeMs <= 7 * 24 * 60 * 60 * 1000 ? "ok" : "warning",
      detail: input.latestDataBackup ? `最近备份：${input.latestDataBackup.name}` : "尚未生成数据备份",
    },
  ]
}

async function buildMetrics() {
  const [userTotal, projectTotal, docTotal, revisionTotal, operationLogTotal, activeSessionTotal] = await Promise.all([
    prisma.user.count(),
    prisma.project.count(),
    prisma.doc.count({
      where: {
        isDeleted: false,
      },
    }),
    prisma.docRevision.count(),
    prisma.operationLog.count(),
    prisma.userSession.count({
      where: {
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
    }),
  ])

  return [
    {
      key: "users",
      label: "用户",
      value: String(userTotal),
      hint: "全部账号",
      tone: "neutral" as const,
    },
    {
      key: "projects",
      label: "项目",
      value: String(projectTotal),
      hint: "全部项目",
      tone: "neutral" as const,
    },
    {
      key: "docs",
      label: "文档",
      value: String(docTotal),
      hint: "未删除 Doc",
      tone: "neutral" as const,
    },
    {
      key: "revisions",
      label: "版本",
      value: String(revisionTotal),
      hint: "Doc Revision",
      tone: "neutral" as const,
    },
    {
      key: "operationLogs",
      label: "审计日志",
      value: String(operationLogTotal),
      hint: "operation_logs",
      tone: "neutral" as const,
    },
    {
      key: "sessions",
      label: "活动会话",
      value: String(activeSessionTotal),
      hint: "未过期未撤销",
      tone: "neutral" as const,
    },
  ]
}

async function collectDataSnapshot(actor: ApiCurrentUser) {
  const [
    users,
    siMainTypes,
    storyIdeas,
    storyIdeaVersions,
    storyIdeaFitAuthors,
    siPreissues,
    projects,
    stagePlanDefaults,
    projectStagePlans,
    projectAssignmentLogs,
    docs,
    docCurrentDrafts,
    docRevisions,
    releaseSourceRevisions,
    notifications,
    todoItems,
    operationLogs,
    exportJobs,
  ] = await Promise.all([
    prisma.user.findMany({
      select: {
        userId: true,
        username: true,
        email: true,
        passwordResetRequired: true,
        role: true,
        status: true,
        displayName: true,
        phone: true,
        biography: true,
        avatarUrl: true,
        preferredLocale: true,
        approvedBy: true,
        approvedAt: true,
        rejectedReason: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.siMainType.findMany(),
    prisma.storyIdea.findMany(),
    prisma.storyIdeaVersion.findMany(),
    prisma.storyIdeaFitAuthor.findMany(),
    prisma.siPreissue.findMany(),
    prisma.project.findMany(),
    prisma.stagePlanDefault.findMany(),
    prisma.projectStagePlan.findMany(),
    prisma.projectAssignmentLog.findMany(),
    prisma.doc.findMany(),
    prisma.docCurrentDraft.findMany(),
    prisma.docRevision.findMany(),
    prisma.releaseSourceRevision.findMany(),
    prisma.notification.findMany(),
    prisma.todoItem.findMany(),
    prisma.operationLog.findMany({
      orderBy: {
        createdAt: "desc",
      },
      take: 5000,
    }),
    prisma.exportJob.findMany(),
  ])

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      generatedBy: actor.userId.toString(),
      version: 1,
      note: "安全数据备份不包含 password_hash、user_sessions 和真实环境变量；operation_logs 只保留最近 5000 条。完整灾备仍应使用数据库原生加密备份。",
    },
    tables: {
      users,
      siMainTypes,
      storyIdeas,
      storyIdeaVersions,
      storyIdeaFitAuthors,
      siPreissues,
      projects,
      stagePlanDefaults,
      projectStagePlans,
      projectAssignmentLogs,
      docs,
      docCurrentDrafts,
      docRevisions,
      releaseSourceRevisions,
      notifications,
      todoItems,
      operationLogs,
      exportJobs,
    },
  }
}

async function hashFile(filePath: string) {
  const buffer = await readFile(/*turbopackIgnore: true*/ filePath)

  return createHash("sha256").update(buffer).digest("hex")
}

async function collectFileManifest(root: string, relativeDir: string, result: Array<Record<string, string | number>>) {
  const absoluteDir = path.join(/*turbopackIgnore: true*/ root, relativeDir)
  const entries = await readdir(/*turbopackIgnore: true*/ absoluteDir, { withFileTypes: true }).catch(() => [])

  for (const entry of entries) {
    const relativePath = path.join(/*turbopackIgnore: true*/ relativeDir, entry.name)

    if (entry.isDirectory()) {
      await collectFileManifest(root, relativePath, result)
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    const absolutePath = path.join(/*turbopackIgnore: true*/ root, relativePath)
    const fileStat = await stat(/*turbopackIgnore: true*/ absolutePath)

    result.push({
      path: relativePath,
      sizeBytes: fileStat.size,
      updatedAt: fileStat.mtime.toISOString(),
      sha256: await hashFile(absolutePath),
    })
  }
}

async function collectSystemSnapshot(actor: ApiCurrentUser) {
  const manifest: Array<Record<string, string | number>> = []

  for (const file of SYSTEM_MANIFEST_FILES) {
    const filePath = path.join(/*turbopackIgnore: true*/ PROJECT_ROOT, file)
    const fileStat = await stat(/*turbopackIgnore: true*/ filePath).catch(() => null)

    if (!fileStat?.isFile()) {
      continue
    }

    manifest.push({
      path: file,
      sizeBytes: fileStat.size,
      updatedAt: fileStat.mtime.toISOString(),
      sha256: await hashFile(filePath),
    })
  }

  for (const directory of SYSTEM_MANIFEST_DIRS) {
    await collectFileManifest(PROJECT_ROOT, directory, manifest)
  }

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      generatedBy: actor.userId.toString(),
      version: 1,
      nodeEnv: process.env.NODE_ENV ?? "unknown",
      note: "系统备份为源码与配置清单快照，只记录文件哈希、大小和更新时间，不包含 .env、node_modules、.next 或备份文件本身。",
    },
    environment: {
      DATABASE_URL: Boolean(process.env.DATABASE_URL),
      SESSION_COOKIE_SECURE: process.env.SESSION_COOKIE_SECURE ? "configured" : "default",
      CRON_SECRET: Boolean(process.env.CRON_SECRET),
    },
    files: manifest.sort((left, right) => String(left.path).localeCompare(String(right.path))),
  }
}

export async function getOpsOverview(actor: ApiCurrentUser): Promise<OpsOverview> {
  ensureAdmin(actor)

  const [database, metrics, cleanupPreview, backups, logs] = await Promise.all([
    getDatabaseHealth(),
    buildMetrics(),
    getCleanupPreview(),
    listRecentBackups(),
    listRuntimeLogs(),
  ])
  const latestDataBackup = backups.find((backup) => backup.type === "data")
  const securityChecks = await buildSecurityChecks({
    databaseOk: database.ok,
    expiredSessions: cleanupPreview.expiredSessions,
    latestDataBackup,
  })

  return {
    health: {
      checkedAt: new Date().toISOString(),
      database,
      runtime: {
        nodeEnv: process.env.NODE_ENV ?? "unknown",
        nodeVersion: process.version,
        platform: process.platform,
        uptimeSeconds: Math.floor(process.uptime()),
      },
    },
    metrics,
    securityChecks,
    backups,
    logs,
    cleanupPreview,
  }
}

export async function createDataBackup(actor: ApiCurrentUser): Promise<OpsBackupResult> {
  ensureAdmin(actor)

  const snapshot = await collectDataSnapshot(actor)
  const backup = await writeJsonBackup("data", "data-backup", snapshot)

  await writeOpsLog(actor, "admin.ops.backup.data", {
    fileName: backup.name,
    sizeBytes: backup.sizeBytes,
  })

  return {
    backup,
  }
}

export async function createSystemBackup(actor: ApiCurrentUser): Promise<OpsBackupResult> {
  ensureAdmin(actor)

  const snapshot = await collectSystemSnapshot(actor)
  const backup = await writeJsonBackup("system", "system-manifest", snapshot)

  await writeOpsLog(actor, "admin.ops.backup.system", {
    fileName: backup.name,
    sizeBytes: backup.sizeBytes,
  })

  return {
    backup,
  }
}

export async function cleanupOpsData(actor: ApiCurrentUser, input: CleanupRetentionInput = {}): Promise<OpsCleanupResult> {
  ensureAdmin(actor)

  const readNotificationDays = normalizeRetentionDays(input.readNotificationDays, DEFAULT_READ_NOTIFICATION_RETENTION_DAYS)
  const closedTodoDays = normalizeRetentionDays(input.closedTodoDays, DEFAULT_CLOSED_TODO_RETENTION_DAYS)
  const exportJobDays = normalizeRetentionDays(input.exportJobDays, DEFAULT_EXPORT_JOB_RETENTION_DAYS)
  const sessionCleanup = await cleanupExpiredUserSessions()

  const [oldReadNotifications, oldClosedTodos, oldExportJobs] = await prisma.$transaction(async (tx) => {
    const notificationCleanup = await tx.notification.deleteMany({
      where: {
        isRead: true,
        createdAt: {
          lt: daysAgo(readNotificationDays),
        },
      },
    })
    const todoCleanup = await tx.todoItem.deleteMany({
      where: {
        status: {
          in: ["done", "cancelled"],
        },
        updatedAt: {
          lt: daysAgo(closedTodoDays),
        },
      },
    })
    const exportJobCleanup = await tx.exportJob.deleteMany({
      where: {
        status: {
          in: ["completed", "failed"],
        },
        createdAt: {
          lt: daysAgo(exportJobDays),
        },
      },
    })

    await tx.operationLog.create({
      data: {
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: "admin.ops.cleanup",
        entityType: "system",
        entityId: 0n,
        metadataJson: {
          readNotificationDays,
          closedTodoDays,
          exportJobDays,
          expiredSessions: sessionCleanup.deleted,
          oldReadNotifications: notificationCleanup.count,
          oldClosedTodos: todoCleanup.count,
          oldExportJobs: exportJobCleanup.count,
        },
      },
    })

    return [notificationCleanup.count, todoCleanup.count, exportJobCleanup.count]
  })

  return {
    deleted: {
      expiredSessions: sessionCleanup.deleted,
      oldReadNotifications,
      oldClosedTodos,
      oldExportJobs,
    },
  }
}

export async function truncateRuntimeLog(actor: ApiCurrentUser, input: TruncateLogInput) {
  ensureAdmin(actor)

  const filePath = makeSafeLogPath(input.fileName)
  const fileStat = await stat(/*turbopackIgnore: true*/ filePath).catch(() => null)

  if (!fileStat?.isFile()) {
    throw new ApiError({
      status: 404,
      code: "LOG_FILE_NOT_FOUND",
      message: "日志文件不存在",
    })
  }

  await truncate(filePath, 0)
  await writeOpsLog(actor, "admin.ops.log.truncate", {
    fileName: input.fileName,
    previousSizeBytes: fileStat.size,
  })

  return {
    log: {
      name: input.fileName ?? "",
      sizeBytes: 0,
      updatedAt: new Date().toISOString(),
      tail: "",
    },
  }
}
