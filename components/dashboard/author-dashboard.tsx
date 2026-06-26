"use client"

import { useEffect, useState } from "react"

import { StatCard } from "@/components/stat-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/status-badge"
import { fetchJson } from "@/lib/api"
import { formatDateOnly } from "@/lib/utils"
import type { WorkspaceDashboardPayload } from "@/types/workbench"
import { useT } from "@/hooks/use-t"
import { BarChart3, FilePen, FileText, FileUp, FolderKanban, Undo2 } from "lucide-react"

// 作者近期提交记录里的动作来自历史服务端中文枚举；这里只翻译系统动作，稿件标题保持用户原文。
const AUTHOR_SUBMISSION_ACTION_KEYS: Record<string, string> = {
  "\u5df2\u901a\u8fc7": "dashboard.action.approved",
  "\u9000\u56de\u5f85\u6539": "dashboard.action.returnedForRevision",
  "\u5df2\u63d0\u4ea4": "dashboard.action.submitted",
  "\u8349\u7a3f": "dashboard.action.draft",
}

export function AuthorDashboard() {
  const t = useT()
  const [stats, setStats] = useState<Extract<WorkspaceDashboardPayload, { role: "author" }>["stats"] | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadDashboard() {
      try {
        const response = await fetchJson<WorkspaceDashboardPayload>("/api/dashboard")

        if (!cancelled && response.role === "author") {
          setStats(response.stats)
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : t("dashboard.author.loadFailed"))
        }
      }
    }

    void loadDashboard()

    return () => {
      cancelled = true
    }
  }, [t])

  if (message) {
    return <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{message}</div>
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t("dashboard.author.myProjectTotal")} value={stats?.projectTotal ?? "..."} icon={FolderKanban} href="/projects" />
        <StatCard label={t("dashboard.author.draftDoc")} value={stats?.draftDocTotal ?? "..."} icon={FilePen} tone="warning" href="/projects" />
        <StatCard label={t("dashboard.pendingSubmitDoc")} value={stats?.pendingSubmitDocTotal ?? "..."} icon={FileUp} href="/todos" />
        <StatCard label={t("dashboard.returnedManuscript")} value={stats?.returnedDocTotal ?? "..."} icon={Undo2} tone="warning" href="/todos" />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard
          label={t("dashboard.author.recentSubmitCount")}
          value={stats?.recentSubmitCount ?? "..."}
          icon={BarChart3}
          hint={t("dashboard.author.currentRangeHint")}
        />
        <StatCard
          label={t("dashboard.author.totalWordCount")}
          value={stats ? t("dashboard.author.wordCountValue", { count: stats.totalWordCount.toLocaleString() }) : "..."}
          icon={FileText}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("dashboard.author.recentSubmissions")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border">
          {(stats?.recentSubmissions ?? []).map((item, index) => (
            <div key={`${item.title}-${item.time}-${index}`} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <div className="flex items-center gap-3">
                <span className="text-sm text-foreground">{item.title}</span>
                <StatusBadge
                  label={t(AUTHOR_SUBMISSION_ACTION_KEYS[item.action] ?? item.action, undefined, item.action)}
                  tone={item.tone}
                />
              </div>
              <span className="text-xs text-muted-foreground">{formatDateOnly(item.time)}</span>
            </div>
          ))}
          {!stats && <div className="py-3 text-sm text-muted-foreground">{t("dashboard.author.loadingRecentSubmissions")}</div>}
          {stats && stats.recentSubmissions.length === 0 && <div className="py-3 text-sm text-muted-foreground">{t("dashboard.author.emptyRecentSubmissions")}</div>}
        </CardContent>
      </Card>
    </div>
  )
}
