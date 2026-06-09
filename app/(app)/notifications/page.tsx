"use client"

import { useState } from "react"
import { PageHeader } from "@/components/page-header"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/status-badge"
import { cn } from "@/lib/utils"
import { CheckCheck, X, ExternalLink } from "lucide-react"

type NotifType =
  | "si_prerelease"
  | "si_convert"
  | "doc_submit"
  | "doc_approve"
  | "doc_return"
  | "revision"
  | "stage_unlock"
  | "enter_qc"
  | "project_done"
  | "stage_warning"
  | "binding_change"

const TYPE_LABELS: Record<NotifType, string> = {
  si_prerelease: "SI 预发",
  si_convert: "SI 转项目",
  doc_submit: "Doc 提交待审",
  doc_approve: "审核通过",
  doc_return: "审核退回",
  revision: "历史快照生成",
  stage_unlock: "阶段解锁",
  enter_qc: "进入全文质检",
  project_done: "项目完成",
  stage_warning: "阶段预警/逾期",
  binding_change: "绑定关系变更",
}

interface NotifItem {
  id: string
  type: NotifType
  title: string
  detail: string
  time: string
  read: boolean
}

const INITIAL: NotifItem[] = [
  {
    id: "n1",
    type: "doc_submit",
    title: "苏小白提交了《长夜未央》第 3 章",
    detail: "作者苏小白已提交《长夜未央》正文第 3 章，等待你的审核。当前编辑权已交接给编辑。",
    time: "2026-06-09 10:24",
    read: false,
  },
  {
    id: "n2",
    type: "doc_return",
    title: "《孤星渡》梗概被退回",
    detail: "编辑林编辑退回了《孤星渡》梗概，退回说明：请补充主角动机与核心冲突。",
    time: "2026-06-08 16:10",
    read: false,
  },
  {
    id: "n3",
    type: "si_prerelease",
    title: "你收到一条新的 SI 预发",
    detail: "编辑林编辑将 SI《都市修真》预发给你，预发说明：适合你擅长的都市题材。",
    time: "2026-06-07 09:00",
    read: false,
  },
  {
    id: "n4",
    type: "stage_unlock",
    title: "《雾中灯塔》已解锁全文质检",
    detail: "项目《雾中灯塔》全部正文章节已通过审核，编辑已手动解锁全文质检阶段。",
    time: "2026-06-06 14:20",
    read: true,
  },
  {
    id: "n5",
    type: "project_done",
    title: "《青衫记》项目已完成",
    detail: "项目《青衫记》全文质检已通过，项目标记为已完成，可下载终稿。",
    time: "2026-06-05 18:00",
    read: true,
  },
  {
    id: "n6",
    type: "binding_change",
    title: "绑定关系发生变更",
    detail: "管理员调整了编辑-作者绑定关系，你现在与编辑林编辑建立协作绑定。",
    time: "2026-06-04 09:30",
    read: true,
  },
]

const FILTERS: { key: NotifType | "all"; label: string }[] = [
  { key: "all", label: "全部" },
  ...(Object.keys(TYPE_LABELS) as NotifType[]).map((k) => ({ key: k, label: TYPE_LABELS[k] })),
]

export default function NotificationsPage() {
  const [items, setItems] = useState<NotifItem[]>(INITIAL)
  const [filter, setFilter] = useState<NotifType | "all">("all")
  const [readFilter, setReadFilter] = useState<"all" | "unread" | "read">("all")
  const [selected, setSelected] = useState<NotifItem | null>(null)

  const filtered = items.filter((n) => {
    if (filter !== "all" && n.type !== filter) return false
    if (readFilter === "unread" && n.read) return false
    if (readFilter === "read" && !n.read) return false
    return true
  })

  function openDetail(item: NotifItem) {
    setSelected(item)
    setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)))
  }

  function markAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  const unreadCount = items.filter((n) => !n.read).length

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["通知中心"]}
        title="通知中心"
        description="展示系统事件告知，与待办区分；待办强调需要处理，通知强调事件告知"
        actions={
          <Button variant="outline" className="bg-transparent" onClick={markAllRead}>
            <CheckCheck className="mr-1.5 size-4" />
            全部已读
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        {/* 已读/未读筛选 */}
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "unread", "read"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setReadFilter(k)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                readFilter === k
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/70",
              )}
            >
              {k === "all" ? "全部" : k === "unread" ? `未读 (${unreadCount})` : "已读"}
            </button>
          ))}
        </div>

        {/* 类型筛选 */}
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs transition-colors",
                filter === f.key
                  ? "border-primary bg-accent text-accent-foreground"
                  : "border-border text-muted-foreground hover:bg-secondary",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {filtered.length === 0 && (
          <Card className="p-10 text-center text-sm text-muted-foreground">暂无符合条件的通知</Card>
        )}
        {filtered.map((n) => (
          <Card
            key={n.id}
            onClick={() => openDetail(n)}
            className={cn(
              "flex cursor-pointer items-start gap-3 p-4 transition-colors hover:border-primary/40",
              !n.read && "border-l-2 border-l-primary",
            )}
          >
            {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
            {n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-transparent" />}
            <div className="flex flex-1 flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("text-sm", n.read ? "text-muted-foreground" : "font-medium text-foreground")}>
                  {n.title}
                </span>
                <StatusBadge label={TYPE_LABELS[n.type]} tone="neutral" />
              </div>
              <span className="text-xs text-muted-foreground">{n.time}</span>
            </div>
          </Card>
        ))}
      </div>

      {/* 通知详情抽屉 */}
      {selected && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={() => setSelected(null)} aria-hidden />
          <aside className="flex h-full w-full max-w-md flex-col bg-background shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold text-foreground">通知详情</h2>
              <button
                onClick={() => setSelected(null)}
                className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary"
                aria-label="关闭"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
              <StatusBadge label={TYPE_LABELS[selected.type]} tone="info" />
              <h3 className="text-base font-medium text-foreground">{selected.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{selected.detail}</p>
              <p className="text-xs text-muted-foreground">{selected.time}</p>
            </div>
            <div className="border-t border-border p-5">
              <Button className="w-full">
                <ExternalLink className="mr-1.5 size-4" />
                查看相关内容
              </Button>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
