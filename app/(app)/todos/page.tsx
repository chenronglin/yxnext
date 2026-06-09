"use client"

import { useState } from "react"
import Link from "next/link"
import { useRole } from "@/components/role-provider"
import { PageHeader } from "@/components/page-header"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/status-badge"
import { cn } from "@/lib/utils"
import { CheckCheck, ChevronRight } from "lucide-react"
import type { BadgeTone } from "@/lib/types"

type TaskType = "si" | "review" | "returned" | "warning" | "overdue" | "approval"

interface TodoItem {
  id: string
  type: TaskType
  title: string
  relatedType: string
  relatedName: string
  status: string
  statusTone: BadgeTone
  due: string
  from: string
  createdAt: string
}

const TASK_TABS: { key: TaskType | "all"; label: string; adminOnly?: boolean }[] = [
  { key: "all", label: "全部" },
  { key: "si", label: "SI 相关" },
  { key: "review", label: "Doc 待审" },
  { key: "returned", label: "退回待改" },
  { key: "warning", label: "阶段预警" },
  { key: "overdue", label: "逾期" },
  { key: "approval", label: "作者审批", adminOnly: true },
]

const ALL_TODOS: TodoItem[] = [
  {
    id: "t1",
    type: "review",
    title: "《长夜未央》第 3 章 待审核",
    relatedType: "Doc",
    relatedName: "长夜未央 / 正文 / 第 3 章",
    status: "已提交待审",
    statusTone: "info",
    due: "2026-06-11",
    from: "苏小白",
    createdAt: "2026-06-09 10:24",
  },
  {
    id: "t2",
    type: "returned",
    title: "《孤星渡》梗概 退回待改",
    relatedType: "Doc",
    relatedName: "孤星渡 / 梗概",
    status: "退回待改",
    statusTone: "warning",
    due: "2026-06-10",
    from: "林编辑",
    createdAt: "2026-06-08 16:10",
  },
  {
    id: "t3",
    type: "si",
    title: "SI《都市修真》待确认转项目",
    relatedType: "SI",
    relatedName: "都市修真选题",
    status: "预发中",
    statusTone: "info",
    due: "—",
    from: "林编辑",
    createdAt: "2026-06-07 09:00",
  },
  {
    id: "t4",
    type: "warning",
    title: "《雾中灯塔》正文阶段即将到期",
    relatedType: "项目",
    relatedName: "雾中灯塔",
    status: "即将到期",
    statusTone: "warning",
    due: "2026-06-12",
    from: "系统",
    createdAt: "2026-06-09 08:00",
  },
  {
    id: "t5",
    type: "overdue",
    title: "《青衫记》细纲阶段已逾期",
    relatedType: "项目",
    relatedName: "青衫记",
    status: "已逾期",
    statusTone: "danger",
    due: "2026-06-05",
    from: "系统",
    createdAt: "2026-06-06 08:00",
  },
  {
    id: "t6",
    type: "approval",
    title: "新作者「周野」注册待审批",
    relatedType: "用户",
    relatedName: "周野",
    status: "待审批",
    statusTone: "warning",
    due: "—",
    from: "周野",
    createdAt: "2026-06-09 11:30",
  },
]

const TYPE_LABELS: Record<TaskType, string> = {
  si: "SI 相关",
  review: "Doc 待审",
  returned: "退回待改",
  warning: "阶段预警",
  overdue: "逾期",
  approval: "作者审批",
}

function getTodoHref(item: TodoItem): string {
  if (item.id === "t1") return "/review"
  if (item.id === "t2") return "/projects/p1/docs/manuscript"
  if (item.id === "t3") return "/si/si1"
  if (item.id === "t4") return "/projects/p1"
  if (item.id === "t5") return "/projects/p1"
  if (item.id === "t6") return "/admin/approvals"
  return "/dashboard"
}

export default function TodosPage() {
  const { role } = useRole()
  const [active, setActive] = useState<TaskType | "all">("all")

  const tabs = TASK_TABS.filter((t) => !t.adminOnly || role === "admin")
  const items = ALL_TODOS.filter((t) => {
    if (t.type === "approval" && role !== "admin") return false
    if (active === "all") return true
    return t.type === active
  })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["待我处理"]}
        title="待我处理"
        description="聚合需要你处理的任务，点击可跳转对应业务页面"
        actions={
          <Button variant="outline" className="bg-transparent">
            <CheckCheck className="mr-1.5 size-4" />
            批量标记已读
          </Button>
        }
      />

      {/* 任务分类标签 */}
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

      {/* 任务列表 */}
      <div className="flex flex-col gap-3">
        {items.length === 0 && (
          <Card className="p-10 text-center text-sm text-muted-foreground">当前分类暂无待处理任务</Card>
        )}
        {items.map((item) => (
          <Card
            key={item.id}
            className="flex flex-col gap-3 p-4 transition-colors hover:border-primary/40 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-foreground">{item.title}</span>
                <StatusBadge label={TYPE_LABELS[item.type]} tone="neutral" />
                <StatusBadge label={item.status} tone={item.statusTone} />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  {item.relatedType}：{item.relatedName}
                </span>
                <span>发起人：{item.from}</span>
                <span>截止：{item.due}</span>
                <span>创建：{item.createdAt}</span>
              </div>
            </div>
            <Button asChild size="sm" variant="outline" className="shrink-0 bg-transparent">
              <Link href={getTodoHref(item)}>
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
