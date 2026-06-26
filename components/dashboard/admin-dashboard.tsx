"use client"

import { useEffect, useState } from "react"
import {
  Users,
  FolderKanban,
  CheckCircle2,
  AlertTriangle,
  FileUp,
  FileCheck2,
  Undo2,
  UserPlus,
} from "lucide-react"

import { StatCard } from "@/components/stat-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { fetchJson } from "@/lib/api"
import { PROJECT_STAGE_LABEL_KEYS } from "@/types/domain"
import type { DashboardStats } from "@/types/admin"
import { useT } from "@/hooks/use-t"

type RangeKey = "7d" | "30d" | "90d" | "all"

type DashboardResponse = {
  stats: DashboardStats
}

const RANGE_LABELS: Record<RangeKey, string> = {
  "7d": "dashboard.range.7d",
  "30d": "dashboard.range.30d",
  "90d": "dashboard.range.90d",
  all: "dashboard.range.all",
}

export function AdminDashboard() {
  const t = useT()
  const [range, setRange] = useState<RangeKey>("30d")
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null)

  useEffect(() => {
    async function loadDashboard() {
      // 管理看板所有卡片都来源于同一份聚合统计，统一走一个接口可以保证口径一致。
      setLoading(true)
      setMessage(null)

      try {
        const response = await fetchJson<DashboardResponse>(`/api/admin/dashboard?range=${range}`)
        setStats(response.stats)
      } catch (error) {
        setMessage({
          type: "error",
          text: error instanceof Error ? error.message : t("dashboard.admin.loadFailed"),
        })
      } finally {
        setLoading(false)
      }
    }

    void loadDashboard()
  }, [range, t])

  const stageCounts = stats?.stageCounts ?? []
  const authorRanking = stats?.authorRanking ?? []
  const editorRanking = stats?.editorRanking ?? []

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <Select value={range} onValueChange={(value) => setRange(value as RangeKey)}>
          <SelectTrigger className="w-32">
            <SelectValue>{t(RANGE_LABELS[range])}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(RANGE_LABELS) as RangeKey[]).map((item) => (
              <SelectItem key={item} value={item}>
                {t(RANGE_LABELS[item])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label={t("dashboard.admin.userTotal")}
          value={loading ? "..." : stats?.userTotal ?? 0}
          icon={Users}
          href="/admin/users"
          hint={
            loading
              ? t("dashboard.admin.counting")
              : t("dashboard.admin.userRoleHint", {
                  authors: stats?.authorTotal ?? 0,
                  editors: stats?.editorTotal ?? 0,
                })
          }
        />
        <StatCard
          label={t("dashboard.admin.projectTotal")}
          value={loading ? "..." : stats?.projectTotal ?? 0}
          icon={FolderKanban}
          href="/governance/projects"
        />
        <StatCard
          label={t("dashboard.admin.completedProjectTotal")}
          value={loading ? "..." : stats?.completedProjectTotal ?? 0}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label={t("dashboard.admin.overdueProjectTotal")}
          value={loading ? "..." : stats?.overdueProjectTotal ?? 0}
          icon={AlertTriangle}
          tone="danger"
          href="/governance/projects?overdue=1"
        />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label={t("dashboard.admin.todaySubmitCount")} value={loading ? "..." : stats?.todaySubmitCount ?? 0} icon={FileUp} />
        <StatCard label={t("dashboard.admin.todayReviewCount")} value={loading ? "..." : stats?.todayReviewCount ?? 0} icon={FileCheck2} />
        <StatCard
          label={t("dashboard.admin.todayReturnCount")}
          value={loading ? "..." : stats?.todayReturnCount ?? 0}
          icon={Undo2}
          tone="warning"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("dashboard.admin.stageProjectCount")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {loading && <div className="text-sm text-muted-foreground">{t("dashboard.admin.loadingStageStats")}</div>}
            {!loading && <StageBars data={stageCounts.map((item) => ({
              label: t(PROJECT_STAGE_LABEL_KEYS[item.stage]),
              value: item.count,
            }))} emptyText={t("dashboard.admin.noStageData")} />}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <RankCard
            title={t("dashboard.admin.authorSubmitRanking")}
            rows={authorRanking}
            emptyText={t("dashboard.admin.noAuthorSubmitData")}
            loading={loading}
            loadingText={t("dashboard.admin.loadingRanking")}
          />
          <RankCard
            title={t("dashboard.admin.editorEfficiencyRanking")}
            rows={editorRanking}
            emptyText={t("dashboard.admin.noEditorReviewData")}
            loading={loading}
            loadingText={t("dashboard.admin.loadingRanking")}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          label={t("dashboard.admin.pendingApprovalAuthors")}
          value={loading ? "..." : stats?.pendingApprovalCount ?? 0}
          icon={UserPlus}
          tone="warning"
          href="/admin/approvals"
        />
        <StatCard
          label={t("dashboard.admin.overdueProjectEntry")}
          value={loading ? "..." : stats?.overdueProjectTotal ?? 0}
          icon={AlertTriangle}
          tone="danger"
          href="/governance/projects?overdue=1"
        />
      </div>
    </div>
  )
}

function StageBars({ data, emptyText }: { data: Array<{ label: string; value: number }>; emptyText: string }) {
  const max = Math.max(...data.map((item) => item.value), 1)

  if (data.length === 0) {
    return <div className="text-sm text-muted-foreground">{emptyText}</div>
  }

  return (
    <>
      {data.map((item) => (
        <div key={item.label} className="flex items-center gap-3">
          <span className="w-20 shrink-0 text-sm text-muted-foreground">{item.label}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
          <span className="w-8 shrink-0 text-right text-sm font-medium text-foreground">{item.value}</span>
        </div>
      ))}
    </>
  )
}

function RankCard({
  title,
  rows,
  emptyText,
  loading,
  loadingText,
}: {
  title: string
  rows: Array<{ name: string; value: string }>
  emptyText: string
  loading: boolean
  loadingText: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5">
        {loading && <div className="text-sm text-muted-foreground">{loadingText}</div>}
        {!loading && rows.length === 0 && <div className="text-sm text-muted-foreground">{emptyText}</div>}
        {!loading &&
          rows.map((row, index) => (
            <div key={`${row.name}-${index}`} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span className="flex size-5 items-center justify-center rounded bg-secondary text-xs text-muted-foreground">
                  {index + 1}
                </span>
                <span className="text-foreground">{row.name}</span>
              </span>
              <span className="text-muted-foreground">{row.value}</span>
            </div>
          ))}
      </CardContent>
    </Card>
  )
}
