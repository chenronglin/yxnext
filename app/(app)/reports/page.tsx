"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { useRole } from "@/components/role-provider"
import { fetchJson } from "@/lib/api"
import type { AdminReportStats } from "@/types/admin"
import {
  Users,
  FolderKanban,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Clock,
  RotateCcw,
  PenLine,
} from "lucide-react"

const RANGE_LABELS: Record<string, string> = {
  "7d": "近 7 天",
  "30d": "近 30 天",
  "90d": "近 90 天",
  all: "全部时间",
}

type RangeKey = "7d" | "30d" | "90d" | "all"

export default function ReportsPage() {
  const { role } = useRole()
  const [range, setRange] = useState<RangeKey>("30d")
  const [dimension, setDimension] = useState("project")

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["统计报表"]}
        title="统计报表"
        description="按角色和权限展示统计数据，支持切换时间范围与统计维度"
        actions={
          <div className="flex gap-2">
            <Select value={range} onValueChange={(value) => setRange(value as RangeKey)}>
              <SelectTrigger className="w-32">
                <SelectValue>{RANGE_LABELS[range]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.keys(RANGE_LABELS).map((r) => (
                  <SelectItem key={r} value={r}>
                    {RANGE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={dimension} onValueChange={setDimension}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="project">项目</SelectItem>
                <SelectItem value="doc">Doc</SelectItem>
                <SelectItem value="author">作者</SelectItem>
                <SelectItem value="editor">编辑</SelectItem>
                <SelectItem value="stage">阶段</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      {role === "admin" && <AdminReport range={range} />}
      {role === "editor" && <EditorReport />}
      {role === "author" && <AuthorReport />}
    </div>
  )
}

function AdminReport({ range }: { range: RangeKey }) {
  const [stats, setStats] = useState<AdminReportStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null)

  useEffect(() => {
    async function loadReport() {
      // 报表页和看板页都依赖后台聚合，但这里额外展示总提交字数，因此单独请求报表接口。
      setLoading(true)
      setMessage(null)

      try {
        const response = await fetchJson<{ stats: AdminReportStats }>(`/api/admin/reports?range=${range}`)
        setStats(response.stats)
      } catch (error) {
        setMessage({
          type: "error",
          text: error instanceof Error ? error.message : "管理员报表读取失败",
        })
      } finally {
        setLoading(false)
      }
    }

    void loadReport()
  }, [range])

  return (
    <div className="flex flex-col gap-6">
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

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        <StatCard label="用户数" value={loading ? "..." : stats?.userCount ?? 0} icon={Users} />
        <StatCard label="项目总数" value={loading ? "..." : stats?.projectTotal ?? 0} icon={FolderKanban} />
        <StatCard
          label="已完成项目"
          value={loading ? "..." : stats?.completedProjectTotal ?? 0}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="已逾期项目"
          value={loading ? "..." : stats?.overdueProjectTotal ?? 0}
          icon={AlertTriangle}
          tone="danger"
        />
        <StatCard
          label="总提交字数"
          value={loading ? "..." : `${(((stats?.totalSubmittedWords ?? 0) / 10000)).toFixed(1)} 万`}
          icon={PenLine}
        />
        <StatCard label="今日提交" value={loading ? "..." : stats?.todaySubmitCount ?? 0} icon={FileText} />
        <StatCard
          label="今日审核"
          value={loading ? "..." : stats?.todayReviewCount ?? 0}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="今日退回"
          value={loading ? "..." : stats?.todayReturnCount ?? 0}
          icon={RotateCcw}
          tone="warning"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-1">
          <h3 className="mb-3 text-sm font-semibold text-foreground">各阶段项目数</h3>
          {loading ? (
            <p className="text-sm text-muted-foreground">正在加载阶段统计...</p>
          ) : (
            <StageBars data={stats?.stageCounts ?? []} />
          )}
        </Card>

        <RankCard
          title="作者提交排行"
          rows={loading ? [] : stats?.authorRanking ?? []}
        />
        <RankCard
          title="编辑效率排行"
          rows={loading ? [] : stats?.editorRanking ?? []}
        />
      </div>
    </div>
  )
}

function EditorReport() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="负责项目数" value={5} icon={FolderKanban} href="/projects" />
        <StatCard label="待审核 Doc" value={4} icon={FileText} tone="warning" href="/todos" />
        <StatCard label="退回 Doc" value={2} icon={RotateCcw} />
        <StatCard label="即将到期项目" value={1} icon={Clock} tone="warning" />
        <StatCard label="已逾期项目" value={1} icon={AlertTriangle} tone="danger" />
      </div>
      <RankCard
        title="最近处理记录"
        rows={[
          { name: "审核通过 · 第三章", value: "06-09 10:20" },
          { name: "退回 · 第五章", value: "06-08 18:45" },
          { name: "解锁质检 · 山海食肆", value: "05-30 09:00" },
        ]}
      />
    </div>
  )
}

function AuthorReport() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="我的项目数" value={2} icon={FolderKanban} href="/projects" />
        <StatCard label="待修改/待提交 Doc" value={3} icon={FileText} tone="warning" href="/todos" />
        <StatCard label="待处理退回稿" value={1} icon={RotateCcw} tone="warning" />
        <StatCard label="最近提交次数" value={12} icon={PenLine} />
        <StatCard label="项目累计字数" value="32.4 万" icon={PenLine} />
      </div>
      <RankCard
        title="最近提交记录"
        rows={[
          { name: "提交 · 第四章", value: "06-08 09:30" },
          { name: "提交 · 第三章", value: "06-04 21:10" },
          { name: "提交 · 细纲", value: "05-30 15:00" },
        ]}
      />
    </div>
  )
}

function StageBars({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1)
  return (
    <div className="flex flex-col gap-3">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3">
          <span className="w-16 shrink-0 text-xs text-muted-foreground">{d.label}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
          <span className="w-6 shrink-0 text-right text-xs font-medium text-foreground">{d.value}</span>
        </div>
      ))}
    </div>
  )
}

function RankCard({ title, rows }: { title: string; rows: { name: string; value: string }[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <ul className="divide-y divide-border text-sm">
        {rows.map((row, i) => (
          <li key={i} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30">
            <div className="flex items-center gap-3">
              <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                {i + 1}
              </span>
              <span className="text-foreground">{row.name}</span>
            </div>
            <span className="text-xs text-muted-foreground">{row.value}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
