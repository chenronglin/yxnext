"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import { PageHeader } from "@/components/page-header"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/status-badge"
import { cn, formatDateOnly } from "@/lib/utils"
import { fetchJson } from "@/lib/api"
import { useT } from "@/hooks/use-t"
import { CheckCheck } from "lucide-react"
import type { NotificationCategory, NotificationItemView } from "@/types/workbench"

type NotificationsResponse = {
  items: NotificationItemView[]
  unreadCount: number
}

const TYPE_LABEL_KEYS: Record<NotificationCategory, `notifications.category.${NotificationCategory}`> = {
  si_prerelease: "notifications.category.si_prerelease",
  si_convert: "notifications.category.si_convert",
  doc_submit: "notifications.category.doc_submit",
  doc_approve: "notifications.category.doc_approve",
  doc_return: "notifications.category.doc_return",
  stage_unlock: "notifications.category.stage_unlock",
  enter_qc: "notifications.category.enter_qc",
  project_done: "notifications.category.project_done",
  stage_warning: "notifications.category.stage_warning",
  binding_change: "notifications.category.binding_change",
  approval_result: "notifications.category.approval_result",
  approval_request: "notifications.category.approval_request",
  forgot_password_request: "notifications.category.forgot_password_request",
  system: "notifications.category.system",
}

const FILTERS: { key: NotificationCategory | "all"; labelKey: string }[] = [
  { key: "all", labelKey: "common.all" },
  { key: "doc_submit", labelKey: TYPE_LABEL_KEYS.doc_submit },
  { key: "doc_return", labelKey: TYPE_LABEL_KEYS.doc_return },
  { key: "doc_approve", labelKey: TYPE_LABEL_KEYS.doc_approve },
  { key: "approval_request", labelKey: TYPE_LABEL_KEYS.approval_request },
  { key: "forgot_password_request", labelKey: TYPE_LABEL_KEYS.forgot_password_request },
]

export default function NotificationsPage() {
  const t = useT()
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
          text: requestError instanceof Error ? requestError.message : t("notifications.loadFailed"),
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
        text: requestError instanceof Error ? requestError.message : t("notifications.markOneFailed"),
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
        text: t("notifications.markAllReadSuccess"),
      })
    } catch (requestError) {
      setMessage({
        type: "error",
        text: requestError instanceof Error ? requestError.message : t("notifications.markAllReadFailed"),
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
        breadcrumb={[t("notifications.title")]}
        title={t("notifications.title")}
        description={t("notifications.description")}
        actions={
          <Button variant="outline" className="bg-transparent" disabled={markingAllRead} onClick={() => void markAllRead()}>
            <CheckCheck className="mr-1.5 size-4" />
            {markingAllRead ? t("common.processing") : t("notifications.markAllRead")}
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
              {key === "all" ? t("common.all") : key === "unread" ? t("notifications.filter.unreadWithCount", { count: unreadCount }) : t("common.read")}
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
              {t(filterItem.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {loading && <Card className="p-10 text-center text-sm text-muted-foreground">{t("notifications.loading")}</Card>}
        {!loading && filtered.length === 0 && (
          <Card className="p-10 text-center text-sm text-muted-foreground">{t("notifications.empty")}</Card>
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
                  <StatusBadge label={t(TYPE_LABEL_KEYS[item.category])} tone="neutral" />
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
