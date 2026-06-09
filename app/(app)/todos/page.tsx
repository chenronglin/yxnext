"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"

import { useRole } from "@/components/role-provider"
import { PageHeader } from "@/components/page-header"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/status-badge"
import { cn } from "@/lib/utils"
import { fetchJson } from "@/lib/api"
import { CheckCheck, ChevronRight } from "lucide-react"
import type { TodoItemView, TodoType } from "@/types/workbench"

type TodosResponse = {
  items: TodoItemView[]
}

const TASK_TABS: { key: TodoType | "all"; label: string; adminOnly?: boolean }[] = [
  { key: "all", label: "全部" },
  { key: "review", label: "Doc 待审" },
  { key: "returned", label: "退回待改" },
  { key: "approval", label: "注册审批", adminOnly: true },
]

const TYPE_LABELS: Record<TodoType, string> = {
  si: "SI 相关",
  review: "Doc 待审",
  returned: "退回待改",
  warning: "阶段预警",
  overdue: "逾期",
  approval: "注册审批",
}

function formatDateTime(value: string) {
  return value === "—" ? value : new Date(value).toLocaleString("zh-CN")
}

export default function TodosPage() {
  const { role } = useRole()
  const [active, setActive] = useState<TodoType | "all">("all")
  const [loading, setLoading] = useState(true)
  const [markingAllRead, setMarkingAllRead] = useState(false)
  const [items, setItems] = useState<TodoItemView[]>([])
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null)

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
          text: requestError instanceof Error ? requestError.message : "待办读取失败",
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
        text: "当前待办已全部标记为已读",
      })
    } catch (requestError) {
      setMessage({
        type: "error",
        text: requestError instanceof Error ? requestError.message : "批量已读失败",
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
        breadcrumb={["待我处理"]}
        title="待我处理"
        description="聚合需要你处理的真实持久化任务，点击可跳转对应业务页面"
        actions={
          <Button variant="outline" className="bg-transparent" disabled={markingAllRead} onClick={() => void handleMarkAllRead()}>
            <CheckCheck className="mr-1.5 size-4" />
            {markingAllRead ? "处理中..." : `批量标记已读${unreadCount > 0 ? ` (${unreadCount})` : ""}`}
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
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {loading && <Card className="p-10 text-center text-sm text-muted-foreground">正在加载待办...</Card>}
        {!loading && filteredItems.length === 0 && (
          <Card className="p-10 text-center text-sm text-muted-foreground">当前分类暂无待处理任务</Card>
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
                  <StatusBadge label={TYPE_LABELS[item.type]} tone="neutral" />
                  <StatusBadge label={item.status} tone={item.statusTone} />
                  {!item.read && <StatusBadge label="未读" tone="info" />}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {item.relatedType}：{item.relatedName}
                  </span>
                  <span>发起人：{item.from}</span>
                  <span>截止：{formatDateTime(item.due)}</span>
                  <span>创建：{formatDateTime(item.createdAt)}</span>
                  <span>已读：{item.readAt ? formatDateTime(item.readAt) : "未读"}</span>
                </div>
              </div>
              <Button asChild size="sm" variant="outline" className="shrink-0 bg-transparent">
                <Link href={item.href}>
                  处理
                  <ChevronRight className="ml-1 size-4" />
                </Link>
              </Button>
            </Card>
          ))}
      </div>
    </div>
  )
}
