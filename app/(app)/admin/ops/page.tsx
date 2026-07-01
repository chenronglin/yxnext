"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Activity,
  DatabaseBackup,
  FileArchive,
  FileText,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { useConfirmDialog, useToast } from "@/components/ui/app-feedback"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { fetchJson } from "@/lib/api"
import { formatDateOnly } from "@/lib/utils"
import type {
  OpsBackupResult,
  OpsCleanupResult,
  OpsLogTruncateResult,
  OpsOverview,
  OpsStatusTone,
} from "@/types/admin"
import type { BadgeTone } from "@/types/domain"

type BusyAction = "data-backup" | "system-backup" | "cleanup" | `truncate:${string}` | null

const statusLabelMap: Record<OpsStatusTone, string> = {
  ok: "正常",
  warning: "注意",
  danger: "风险",
  neutral: "信息",
}

const statusToneMap: Record<OpsStatusTone, BadgeTone> = {
  ok: "success",
  warning: "warning",
  danger: "danger",
  neutral: "neutral",
}

function formatBytes(value: number) {
  // 运维页统一把字节转换成易读单位，避免表格里直接出现难以判断大小的长数字。
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function formatDuration(seconds: number) {
  // 运行时长按天/小时/分钟展示，便于上线后判断服务是否发生过重启。
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (days > 0) return `${days} 天 ${hours} 小时`
  if (hours > 0) return `${hours} 小时 ${minutes} 分钟`
  return `${minutes} 分钟`
}

export default function AdminOpsPage() {
  const confirm = useConfirmDialog()
  const toast = useToast()
  const [overview, setOverview] = useState<OpsOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyAction, setBusyAction] = useState<BusyAction>(null)
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null)
  const [retention, setRetention] = useState({
    readNotificationDays: "180",
    closedTodoDays: "180",
    exportJobDays: "90",
  })

  async function loadOverview() {
    // 总览数据包括数据库计数、文件系统日志和备份列表，刷新时统一从一个接口读取，避免多个请求状态不同步。
    setLoading(true)
    setMessage(null)

    try {
      const response = await fetchJson<OpsOverview>("/api/admin/ops")
      setOverview(response)
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "运维状态读取失败",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadOverview()
  }, [])

  const cleanupTotal = useMemo(() => {
    if (!overview) return 0

    // 清理预估只统计保守可删数据，不包含正文、版本、用户和审计日志。
    return (
      overview.cleanupPreview.expiredSessions +
      overview.cleanupPreview.oldReadNotifications +
      overview.cleanupPreview.oldClosedTodos +
      overview.cleanupPreview.oldExportJobs
    )
  }, [overview])

  async function handleCreateDataBackup() {
    const confirmed = await confirm({
      title: "生成数据备份",
      description: "系统会在服务器 backups/data 目录生成业务数据 JSON 快照。",
      confirmText: "生成备份",
    })

    if (!confirmed || busyAction) return

    setBusyAction("data-backup")
    setMessage(null)

    try {
      const response = await fetchJson<OpsBackupResult>("/api/admin/ops/backups/data", {
        method: "POST",
      })

      toast({
        type: "success",
        title: "数据备份已生成",
        description: response.backup.name,
      })
      await loadOverview()
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "数据备份失败",
      })
    } finally {
      setBusyAction(null)
    }
  }

  async function handleCreateSystemBackup() {
    const confirmed = await confirm({
      title: "生成系统备份清单",
      description: "系统会在服务器 backups/system 目录生成源码、迁移和配置哈希清单。",
      confirmText: "生成清单",
    })

    if (!confirmed || busyAction) return

    setBusyAction("system-backup")
    setMessage(null)

    try {
      const response = await fetchJson<OpsBackupResult>("/api/admin/ops/backups/system", {
        method: "POST",
      })

      toast({
        type: "success",
        title: "系统备份清单已生成",
        description: response.backup.name,
      })
      await loadOverview()
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "系统备份失败",
      })
    } finally {
      setBusyAction(null)
    }
  }

  async function handleCleanup() {
    const confirmed = await confirm({
      title: "执行数据库清理",
      description: `本次预计清理 ${cleanupTotal} 条过期运行数据，不会删除正文、版本、用户或项目。`,
      confirmText: "确认清理",
      tone: "danger",
    })

    if (!confirmed || busyAction) return

    setBusyAction("cleanup")
    setMessage(null)

    try {
      const response = await fetchJson<OpsCleanupResult>("/api/admin/ops/cleanup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          readNotificationDays: Number(retention.readNotificationDays),
          closedTodoDays: Number(retention.closedTodoDays),
          exportJobDays: Number(retention.exportJobDays),
        }),
      })
      const deletedTotal =
        response.deleted.expiredSessions +
        response.deleted.oldReadNotifications +
        response.deleted.oldClosedTodos +
        response.deleted.oldExportJobs

      toast({
        type: "success",
        title: "数据库清理完成",
        description: `已清理 ${deletedTotal} 条运行数据`,
      })
      await loadOverview()
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "数据库清理失败",
      })
    } finally {
      setBusyAction(null)
    }
  }

  async function handleTruncateLog(fileName: string) {
    const confirmed = await confirm({
      title: "清空运行日志",
      description: `确认清空 ${fileName}？该动作只截断日志文件，不影响审计日志。`,
      confirmText: "确认清空",
      tone: "danger",
    })

    if (!confirmed || busyAction) return

    setBusyAction(`truncate:${fileName}`)
    setMessage(null)

    try {
      await fetchJson<OpsLogTruncateResult>("/api/admin/ops/logs/truncate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fileName }),
      })

      toast({
        type: "success",
        title: "日志已清空",
        description: fileName,
      })
      await loadOverview()
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "日志清空失败",
      })
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["运维管理"]}
        title="运维管理"
        description="集中处理上线后的安全、备份、清理和运行日志"
        actions={
          <Button variant="outline" onClick={() => void loadOverview()} disabled={loading || Boolean(busyAction)}>
            <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
            刷新
          </Button>
        }
      />

      {message && (
        <div
          className={
            message.type === "error"
              ? "rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600"
              : "rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
          }
        >
          {message.text}
        </div>
      )}

      {loading && !overview && (
        <Card className="p-6 text-sm text-muted-foreground">正在读取运维状态...</Card>
      )}

      {overview && (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Card className="flex flex-row items-center justify-between gap-3 p-4">
              <div className="min-w-0 space-y-1">
                <p className="text-sm text-muted-foreground">数据库</p>
                <p className="text-xl font-semibold text-foreground">
                  {overview.health.database.ok ? "正常" : "异常"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {overview.health.database.latencyMs === null
                    ? overview.health.database.message
                    : `${overview.health.database.latencyMs} ms`}
                </p>
              </div>
              <ShieldCheck className={overview.health.database.ok ? "size-9 text-emerald-600" : "size-9 text-red-600"} />
            </Card>

            <Card className="flex flex-row items-center justify-between gap-3 p-4">
              <div className="min-w-0 space-y-1">
                <p className="text-sm text-muted-foreground">运行环境</p>
                <p className="text-xl font-semibold text-foreground">{overview.health.runtime.nodeEnv}</p>
                <p className="truncate text-xs text-muted-foreground">{overview.health.runtime.nodeVersion}</p>
              </div>
              <Activity className="size-9 text-primary" />
            </Card>

            <Card className="flex flex-row items-center justify-between gap-3 p-4">
              <div className="min-w-0 space-y-1">
                <p className="text-sm text-muted-foreground">运行时长</p>
                <p className="text-xl font-semibold text-foreground">
                  {formatDuration(overview.health.runtime.uptimeSeconds)}
                </p>
                <p className="truncate text-xs text-muted-foreground">{overview.health.runtime.platform}</p>
              </div>
              <HardDrive className="size-9 text-primary" />
            </Card>

            <Card className="flex flex-row items-center justify-between gap-3 p-4">
              <div className="min-w-0 space-y-1">
                <p className="text-sm text-muted-foreground">可清理数据</p>
                <p className="text-xl font-semibold text-foreground">{cleanupTotal}</p>
                <p className="truncate text-xs text-muted-foreground">过期会话、已读通知、关闭待办</p>
              </div>
              <Trash2 className={cleanupTotal > 0 ? "size-9 text-amber-600" : "size-9 text-emerald-600"} />
            </Card>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {overview.metrics.map((metric) => (
              <Card key={metric.key} className="flex flex-row items-center justify-between gap-3 p-4">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm text-muted-foreground">{metric.label}</p>
                  <p className="text-2xl font-semibold text-foreground">{metric.value}</p>
                  {metric.hint && <p className="truncate text-xs text-muted-foreground">{metric.hint}</p>}
                </div>
                <FileText className="size-8 text-muted-foreground" />
              </Card>
            ))}
          </div>

          <Card className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">安全加固检查</h2>
                <p className="text-sm text-muted-foreground">最近检查时间：{formatDateOnly(overview.health.checkedAt)}</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {overview.securityChecks.map((item) => (
                <div key={item.key} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-foreground">{item.label}</p>
                    <StatusBadge label={statusLabelMap[item.status]} tone={statusToneMap[item.status]} />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{item.detail}</p>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <Card className="p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-foreground">数据备份 / 系统备份</h2>
                  <p className="text-sm text-muted-foreground">备份文件保存在服务器本地 backups 目录</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void handleCreateDataBackup()} disabled={Boolean(busyAction)}>
                    <DatabaseBackup className="size-4" />
                    {busyAction === "data-backup" ? "生成中..." : "数据备份"}
                  </Button>
                  <Button variant="outline" onClick={() => void handleCreateSystemBackup()} disabled={Boolean(busyAction)}>
                    <FileArchive className="size-4" />
                    {busyAction === "system-backup" ? "生成中..." : "系统清单"}
                  </Button>
                </div>
              </div>

              <div className="mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>文件</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>大小</TableHead>
                      <TableHead>时间</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview.backups.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                          暂无备份
                        </TableCell>
                      </TableRow>
                    )}
                    {overview.backups.map((backup) => (
                      <TableRow key={`${backup.type}:${backup.name}`}>
                        <TableCell className="max-w-[240px] truncate font-medium">{backup.name}</TableCell>
                        <TableCell>
                          <StatusBadge label={backup.type === "data" ? "数据" : "系统"} tone="info" />
                        </TableCell>
                        <TableCell>{formatBytes(backup.sizeBytes)}</TableCell>
                        <TableCell>{formatDateOnly(backup.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-foreground">数据库清理</h2>
                  <p className="text-sm text-muted-foreground">仅清理运行辅助数据，不清理业务正文和版本</p>
                </div>
                <Button variant="destructive" onClick={() => void handleCleanup()} disabled={Boolean(busyAction)}>
                  <Trash2 className="size-4" />
                  {busyAction === "cleanup" ? "清理中..." : "执行清理"}
                </Button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="readNotificationDays">已读通知保留天数</Label>
                  <Input
                    id="readNotificationDays"
                    type="number"
                    min={7}
                    max={3650}
                    value={retention.readNotificationDays}
                    onChange={(event) =>
                      setRetention((current) => ({ ...current, readNotificationDays: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="closedTodoDays">关闭待办保留天数</Label>
                  <Input
                    id="closedTodoDays"
                    type="number"
                    min={7}
                    max={3650}
                    value={retention.closedTodoDays}
                    onChange={(event) =>
                      setRetention((current) => ({ ...current, closedTodoDays: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="exportJobDays">导出任务保留天数</Label>
                  <Input
                    id="exportJobDays"
                    type="number"
                    min={7}
                    max={3650}
                    value={retention.exportJobDays}
                    onChange={(event) =>
                      setRetention((current) => ({ ...current, exportJobDays: event.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                <p>过期会话：{overview.cleanupPreview.expiredSessions}</p>
                <p>已读通知：{overview.cleanupPreview.oldReadNotifications}</p>
                <p>关闭待办：{overview.cleanupPreview.oldClosedTodos}</p>
                <p>导出任务：{overview.cleanupPreview.oldExportJobs}</p>
              </div>
            </Card>
          </div>

          <Card className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">日志管理</h2>
                <p className="text-sm text-muted-foreground">展示项目根目录 .log 文件尾部内容</p>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-4">
              {overview.logs.length === 0 && (
                <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                  暂无运行日志文件
                </div>
              )}
              {overview.logs.map((log) => (
                <div key={log.name} className="rounded-lg border border-border">
                  <div className="flex flex-col gap-3 border-b border-border p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{log.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(log.sizeBytes)} · {formatDateOnly(log.updatedAt)}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => void handleTruncateLog(log.name)}
                      disabled={Boolean(busyAction)}
                    >
                      <Trash2 className="size-4" />
                      {busyAction === `truncate:${log.name}` ? "清空中..." : "清空"}
                    </Button>
                  </div>
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
                    {log.tail || "日志为空"}
                  </pre>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
