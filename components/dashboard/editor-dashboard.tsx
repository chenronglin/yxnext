"use client"

import { useEffect, useState } from "react"

import { StatCard } from "@/components/stat-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/status-badge"
import { fetchJson } from "@/lib/api"
import type { WorkspaceDashboardPayload } from "@/types/workbench"
import { AlertTriangle, FileCheck2, FolderKanban, Library, Send, Undo2, Clock } from "lucide-react"

export function EditorDashboard() {
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
          setMessage(error instanceof Error ? error.message : "编辑看板读取失败")
        }
      }
    }

    void loadDashboard()

    return () => {
      cancelled = true
    }
  }, [])

  if (message) {
    return <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{message}</div>
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="负责项目数" value={stats?.responsibleProjectTotal ?? "..."} icon={FolderKanban} href="/projects" />
        <StatCard label="待审核 Doc" value={stats?.pendingReviewDocTotal ?? "..."} icon={FileCheck2} tone="warning" href="/review" />
        <StatCard label="退回 Doc" value={stats?.returnedDocTotal ?? "..."} icon={Undo2} tone="warning" href="/todos" />
        <StatCard label="即将到期项目" value={stats?.dueSoonProjectTotal ?? "..."} icon={Clock} tone="warning" href="/projects" />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="已逾期项目" value={stats?.overdueProjectTotal ?? "..."} icon={AlertTriangle} tone="danger" href="/projects?overdue=yes" />
        <StatCard label="SI 草稿数量" value={stats?.siDraftTotal ?? "..."} icon={Library} href="/si?status=draft" />
        <StatCard label="预发中 SI" value={stats?.siPrereleasedTotal ?? "..."} icon={Send} href="/si/prereleases" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">最近处理记录</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border">
          {(stats?.recentActivities ?? []).map((item, index) => (
            <div key={`${item.title}-${item.time}-${index}`} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <div className="flex items-center gap-3">
                <span className="text-sm text-foreground">{item.title}</span>
                <StatusBadge label={item.action} tone={item.tone} />
              </div>
              <span className="text-xs text-muted-foreground">{item.time}</span>
            </div>
          ))}
          {!stats && <div className="py-3 text-sm text-muted-foreground">正在加载最近处理记录...</div>}
          {stats && stats.recentActivities.length === 0 && <div className="py-3 text-sm text-muted-foreground">暂无最近处理记录。</div>}
        </CardContent>
      </Card>
    </div>
  )
}
