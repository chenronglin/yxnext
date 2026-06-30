"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"

import { useRole } from "@/components/role-provider"
import { PageHeader } from "@/components/page-header"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/status-badge"
import { cn, formatDateOnly } from "@/lib/utils"
import { fetchJson } from "@/lib/api"
import { useT } from "@/hooks/use-t"
import { CheckCheck, ChevronRight } from "lucide-react"
import type { TodoItemView, TodoType } from "@/types/workbench"

type TodosResponse = {
  items: TodoItemView[]
}

const TASK_TABS: { key: TodoType | "all"; labelKey: string; adminOnly?: boolean }[] = [
  { key: "all", labelKey: "common.all" },
  { key: "review", labelKey: "todos.tab.review" },
  { key: "returned", labelKey: "todos.tab.returned" },
  { key: "approval", labelKey: "todos.type.approval", adminOnly: true },
]

const TYPE_LABEL_KEYS: Record<TodoType, `todos.type.${TodoType}`> = {
  si: "todos.type.si",
  review: "todos.type.review",
  returned: "todos.type.returned",
  warning: "todos.type.warning",
  overdue: "todos.type.overdue",
  approval: "todos.type.approval",
}

function normalizeTodoType(value: string | null): TodoType | "all" {
  // 统计卡片会带 type 查询参数进入待办页，这里只接受页面真实支持的分类，避免错误参数造成空白状态。
  if (value === "review" || value === "returned" || value === "approval" || value === "si" || value === "warning" || value === "overdue") {
    return value
  }

  return "all"
}

export default function TodosPage() {
  const t = useT()
  const { role } = useRole()
  const searchParams = useSearchParams()
  const requestedType = searchParams.get("type")
  const [active, setActive] = useState<TodoType | "all">(() => normalizeTodoType(requestedType))
  const [loading, setLoading] = useState(true)
  const [markingAllRead, setMarkingAllRead] = useState(false)
  const [items, setItems] = useState<TodoItemView[]>([])
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null)

  useEffect(() => {
    // 用户从看板或报表通过查询参数进入时，列表直接切到对应任务类型。
    setActive(normalizeTodoType(requestedType))
  }, [requestedType])

  useEffect(() => {
    async function loadTodos() {
      setLoading(true)
      setMessage(null)

      try {
        // 待办页现在直接读取真实 todo_items 投影，不再展示无持久化来源的临时任务。
        const response = await fetchJson<TodosResponse>("/api/todos")
        setItems(response.items)
      } catch (requestError) {
        setMessage({
          type: "error",
          text: requestError instanceof Error ? requestError.message : t("todos.loadFailed"),
        })
      } finally {
        setLoading(false)
      }
    }

    void loadTodos()
  }, [])

  async function handleMarkAllRead() {
    setMarkingAllRead(true)
    setMessage(null)

    try {
      await fetchJson("/api/todos/read-all", {
        method: "POST",
      })
      setItems((current) =>
        current.map((item) => ({
          ...item,
          read: true,
          readAt: item.readAt ?? new Date().toISOString(),
        })),
      )
      setMessage({
        type: "success",
        text: t("todos.markAllReadSuccess"),
      })
    } catch (requestError) {
      setMessage({
        type: "error",
        text: requestError instanceof Error ? requestError.message : t("todos.markAllReadFailed"),
      })
    } finally {
      setMarkingAllRead(false)
    }
  }

  const tabs = TASK_TABS.filter((tab) => !tab.adminOnly || role === "admin")
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (item.type === "approval" && role !== "admin") return false
      if (active === "all") return true
      return item.type === active
    })
  }, [active, items, role])

  const unreadCount = items.filter((item) => !item.read).length

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[t("todos.title")]}
        title={t("todos.title")}
        description={t("todos.description")}
        actions={
          <Button variant="outline" className="bg-transparent" disabled={markingAllRead} onClick={() => void handleMarkAllRead()}>
            <CheckCheck className="mr-1.5 size-4" />
            {markingAllRead
              ? t("common.processing")
              : unreadCount > 0
                ? t("todos.markAllReadWithCount", { count: unreadCount })
                : t("todos.markAllRead")}
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

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              active === tab.key
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/70",
            )}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {loading && <Card className="p-10 text-center text-sm text-muted-foreground">{t("todos.loading")}</Card>}
        {!loading && filteredItems.length === 0 && (
          <Card className="p-10 text-center text-sm text-muted-foreground">{t("todos.empty")}</Card>
        )}
        {!loading &&
          filteredItems.map((item) => (
            <Card
              key={item.id}
              className={cn(
                "flex flex-col gap-3 p-4 transition-colors hover:border-primary/40 sm:flex-row sm:items-center sm:justify-between",
                !item.read && "border-l-2 border-l-primary",
              )}
            >
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{item.title}</span>
                  <StatusBadge label={t(TYPE_LABEL_KEYS[item.type])} tone="neutral" />
                  <StatusBadge label={item.status} tone={item.statusTone} />
                  {!item.read && <StatusBadge label={t("common.unread")} tone="info" />}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {item.relatedType}: {item.relatedName}
                  </span>
                  <span>{t("todos.from")}: {item.from}</span>
                  <span>{t("todos.due")}: {formatDateOnly(item.due)}</span>
                  <span>{t("todos.created")}: {formatDateOnly(item.createdAt)}</span>
                  <span>{t("todos.readAt")}: {item.readAt ? formatDateOnly(item.readAt) : t("common.unread")}</span>
                </div>
                {/* detail 承载提交说明、退回原因等动作上下文；为空时不占位，避免普通待办出现多余空行。 */}
                {item.detail && <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{item.detail}</p>}
              </div>
              <Button asChild size="sm" variant="outline" className="shrink-0 bg-transparent">
                <Link href={item.href}>
                  {t("todos.action")}
                  <ChevronRight className="ml-1 size-4" />
                </Link>
              </Button>
            </Card>
          ))}
      </div>
    </div>
  )
}
