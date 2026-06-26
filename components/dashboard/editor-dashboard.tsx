"use client"

import { useEffect, useState } from "react"

import { StatCard } from "@/components/stat-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/status-badge"
import { fetchJson } from "@/lib/api"
import { formatDateOnly } from "@/lib/utils"
import type { WorkspaceDashboardPayload } from "@/types/workbench"
import { useT } from "@/hooks/use-t"
import { AlertTriangle, FileCheck2, FolderKanban, Library, Send, Undo2, Clock } from "lucide-react"

// 后端近期处理记录暂时返回历史中文动作；这里仅翻译系统动作，不翻译项目标题、Doc 标题等用户业务内容。
const EDITOR_ACTIVITY_ACTION_KEYS: Record<string, string> = {
  "\u5df2\u901a\u8fc7": "dashboard.action.approved",
  "\u5df2\u9000\u56de": "dashboard.action.returned",
  "\u8d28\u68c0\u5df2\u89e3\u9501": "dashboard.action.qcUnlocked",
  "\u9879\u76ee\u5df2\u5b8c\u6210": "dashboard.action.projectCompleted",
  "\u5df2\u8f6c\u9879\u76ee": "dashboard.action.convertedProject",
}

export function EditorDashboard() {
  const t = useT()
  const [stats, setStats] = useState<Extract<WorkspaceDashboardPayload, { role: "editor" }>["stats"] | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadDashboard() {
      try {
        const response = await fetchJson<WorkspaceDashboardPayload>("/api/dashboard")

        if (!cancelled && response.role === "editor") {
          setStats(response.stats)
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : t("dashboard.editor.loadFailed"))
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
        <StatCard label={t("dashboard.editor.responsibleProjectTotal")} value={stats?.responsibleProjectTotal ?? "..."} icon={FolderKanban} href="/projects" />
        <StatCard label={t("dashboard.pendingReviewDoc")} value={stats?.pendingReviewDocTotal ?? "..."} icon={FileCheck2} tone="warning" href="/todos?type=review" />
        <StatCard label={t("dashboard.returnedDoc")} value={stats?.returnedDocTotal ?? "..."} icon={Undo2} tone="warning" href="/todos?type=returned" />
        <StatCard label={t("dashboard.editor.dueSoonProjectTotal")} value={stats?.dueSoonProjectTotal ?? "..."} icon={Clock} tone="warning" href="/projects" />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label={t("dashboard.editor.overdueProjectTotal")} value={stats?.overdueProjectTotal ?? "..."} icon={AlertTriangle} tone="danger" href="/projects?overdue=yes" />
        <StatCard label={t("dashboard.editor.siDraftTotal")} value={stats?.siDraftTotal ?? "..."} icon={Library} href="/si?status=draft" />
        <StatCard label={t("dashboard.editor.siPrereleasedTotal")} value={stats?.siPrereleasedTotal ?? "..."} icon={Send} href="/si/prereleases" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("dashboard.editor.recentActivities")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border">
          {(stats?.recentActivities ?? []).map((item, index) => (
            <div key={`${item.title}-${item.time}-${index}`} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <div className="flex items-center gap-3">
                <span className="text-sm text-foreground">{item.title}</span>
                <StatusBadge
                  label={t(EDITOR_ACTIVITY_ACTION_KEYS[item.action] ?? item.action, undefined, item.action)}
                  tone={item.tone}
                />
              </div>
              <span className="text-xs text-muted-foreground">{formatDateOnly(item.time)}</span>
            </div>
          ))}
          {!stats && <div className="py-3 text-sm text-muted-foreground">{t("dashboard.editor.loadingRecentActivities")}</div>}
          {stats && stats.recentActivities.length === 0 && <div className="py-3 text-sm text-muted-foreground">{t("dashboard.editor.emptyRecentActivities")}</div>}
        </CardContent>
      </Card>
    </div>
  )
}
