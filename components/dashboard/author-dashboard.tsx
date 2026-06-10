"use client"

import { useEffect, useState } from "react"

import { StatCard } from "@/components/stat-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/status-badge"
import { fetchJson } from "@/lib/api"
import type { WorkspaceDashboardPayload } from "@/types/workbench"
import { BarChart3, FilePen, FileText, FileUp, FolderKanban, Undo2 } from "lucide-react"

export function AuthorDashboard() {
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
          setMessage(error instanceof Error ? error.message : "作者看板读取失败")
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
        <StatCard label="我的项目数" value={stats?.projectTotal ?? "..."} icon={FolderKanban} href="/projects" />
        <StatCard label="草稿 Doc" value={stats?.draftDocTotal ?? "..."} icon={FilePen} tone="warning" href="/projects" />
        <StatCard label="待提交 Doc" value={stats?.pendingSubmitDocTotal ?? "..."} icon={FileUp} href="/todos" />
        <StatCard label="待处理退回稿" value={stats?.returnedDocTotal ?? "..."} icon={Undo2} tone="warning" href="/todos" />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="近期开稿提交次数" value={stats?.recentSubmitCount ?? "..."} icon={BarChart3} hint="按当前筛选时间范围统计" />
        <StatCard
          label="项目累计字数"
          value={stats ? `${(stats.totalWordCount / 10000).toFixed(1)} 万` : "..."}
          icon={FileText}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">最近提交记录</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border">
          {(stats?.recentSubmissions ?? []).map((item, index) => (
            <div key={`${item.title}-${item.time}-${index}`} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <div className="flex items-center gap-3">
                <span className="text-sm text-foreground">{item.title}</span>
                <StatusBadge label={item.action} tone={item.tone} />
              </div>
              <span className="text-xs text-muted-foreground">{item.time}</span>
            </div>
          ))}
          {!stats && <div className="py-3 text-sm text-muted-foreground">正在加载最近提交记录...</div>}
          {stats && stats.recentSubmissions.length === 0 && <div className="py-3 text-sm text-muted-foreground">暂无最近提交记录。</div>}
        </CardContent>
      </Card>
    </div>
  )
}
