"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import { PageHeader } from "@/components/page-header"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/status-badge"
import { cn, formatDateOnly } from "@/lib/utils"
import { fetchJson } from "@/lib/api"
import { CheckCheck } from "lucide-react"
import type { NotificationCategory, NotificationItemView } from "@/types/workbench"

type NotificationsResponse = {
  items: NotificationItemView[]
  unreadCount: number
}

const TYPE_LABELS: Record<NotificationCategory, string> = {
  si_prerelease: "SI 预发",
  si_convert: "SI 转项目",
  doc_submit: "Doc 提交待审",
  doc_approve: "审核通过",
  doc_return: "审核退回",
  stage_unlock: "阶段解锁",
  enter_qc: "进入质检",
  project_done: "项目完成",
  stage_warning: "阶段预警/逾期",
  binding_change: "绑定关系变更",
  approval_result: "注册结果",
  approval_request: "注册审批",
  forgot_password_request: "忘记密码",
  system: "系统通知",
}

const FILTERS: { key: NotificationCategory | "all"; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "doc_submit", label: TYPE_LABELS.doc_submit },
  { key: "doc_return", label: TYPE_LABELS.doc_return },
  { key: "doc_approve", label: TYPE_LABELS.doc_approve },
  { key: "approval_request", label: TYPE_LABELS.approval_request },
  { key: "forgot_password_request", label: TYPE_LABELS.forgot_password_request },
]

export default function NotificationsPage() {
  const router = useRouter()
  const [items, setItems] = useState<NotificationItemView[]>([])
  const [loading, setLoading] = useState(true)
  const [markingAllRead, setMarkingAllRead] = useState(false)
  const [filter, setFilter] = useState<NotificationCategory | "all">("all")
  const [readFilter, setReadFilter] = useState<"all" | "unread" | "read">("all")
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null)

  useEffect(() => {
    async function loadNotifications() {
      setLoading(true)
      setMessage(null)

      try {
        const response = await fetchJson<NotificationsResponse>("/api/notifications")
        setItems(response.items)
      } catch (requestError) {
        setMessage({
          type: "error",
          text: requestError instanceof Error ? requestError.message : "通知读取失败",
        })
      } finally {
        setLoading(false)
      }
    }

    void loadNotifications()
  }, [])

  async function markOneRead(item: NotificationItemView) {
    if (item.read) return

    await fetchJson(`/api/notifications/${item.id}/read`, {
      method: "POST",
    })

    setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, read: true } : entry)))
  }

  async function openNotificationTarget(item: NotificationItemView) {
    try {
      // 通知点击就是业务跳转；已读状态只做伴随更新，失败也不阻断用户进入对应文稿或项目页面。
      await markOneRead(item)
    } catch (requestError) {
      setMessage({
        type: "error",
        text: requestError instanceof Error ? requestError.message : "通知已读状态更新失败",
      })
    } finally {
      router.push(item.href)
    }
  }

  async function markAllRead() {
    setMarkingAllRead(true)
    setMessage(null)

    try {
      await fetchJson("/api/notifications/read-all", {
        method: "POST",
      })
      setItems((current) => current.map((item) => ({ ...item, read: true })))
      setMessage({
        type: "success",
        text: "通知已全部标记为已读",
      })
    } catch (requestError) {
      setMessage({
        type: "error",
        text: requestError instanceof Error ? requestError.message : "全部已读失败",
      })
    } finally {
      setMarkingAllRead(false)
    }
  }

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (filter !== "all" && item.category !== filter) return false
      if (readFilter === "unread" && item.read) return false
      if (readFilter === "read" && !item.read) return false
      return true
    })
  }, [filter, items, readFilter])

  const unreadCount = items.filter((item) => !item.read).length

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["通知中心"]}
        title="通知中心"
        description="展示系统事件告知；Doc 三类协作通知与管理员事件通知都从真实接口读取"
        actions={
          <Button variant="outline" className="bg-transparent" disabled={markingAllRead} onClick={() => void markAllRead()}>
            <CheckCheck className="mr-1.5 size-4" />
            {markingAllRead ? "处理中..." : "全部已读"}
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

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "unread", "read"] as const).map((key) => (
            <button
              key={key}
              onClick={() => setReadFilter(key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                readFilter === key
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/70",
              )}
            >
              {key === "all" ? "全部" : key === "unread" ? `未读 (${unreadCount})` : "已读"}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((filterItem) => (
            <button
              key={filterItem.key}
              onClick={() => setFilter(filterItem.key)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs transition-colors",
                filter === filterItem.key
                  ? "border-primary bg-accent text-accent-foreground"
                  : "border-border text-muted-foreground hover:bg-secondary",
              )}
            >
              {filterItem.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {loading && <Card className="p-10 text-center text-sm text-muted-foreground">正在加载通知...</Card>}
        {!loading && filtered.length === 0 && (
          <Card className="p-10 text-center text-sm text-muted-foreground">暂无符合条件的通知</Card>
        )}
        {!loading &&
          filtered.map((item) => (
            <Card
              key={item.id}
              onClick={() => void openNotificationTarget(item)}
              className={cn(
                "flex cursor-pointer items-start gap-3 p-4 transition-colors hover:border-primary/40 hover:bg-secondary/30",
                !item.read && "border-l-2 border-l-primary",
              )}
            >
              {!item.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
              {item.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-transparent" />}
              <div className="flex flex-1 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("text-sm", item.read ? "text-muted-foreground" : "font-medium text-foreground")}>
                    {item.title}
                  </span>
                  <StatusBadge label={TYPE_LABELS[item.category]} tone="neutral" />
                </div>
                <span className="text-xs text-muted-foreground">{formatDateOnly(item.time)}</span>
                {item.detail && <span className="line-clamp-2 text-sm leading-6 text-muted-foreground">{item.detail}</span>}
              </div>
            </Card>
          ))}
      </div>
    </div>
  )
}
