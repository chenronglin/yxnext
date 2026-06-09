import { FolderKanban, FileCheck2, Undo2, Clock, AlertTriangle, Library, Send } from "lucide-react"
import { StatCard } from "@/components/stat-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/status-badge"

const recent = [
  { title: "《长夜未央》第 3 章", action: "已通过", tone: "success" as const, time: "10 分钟前" },
  { title: "《雾中灯塔》细纲", action: "已退回", tone: "warning" as const, time: "1 小时前" },
  { title: "《孤星渡》梗概", action: "待审核", tone: "info" as const, time: "2 小时前" },
  { title: "《青衫记》第 5 章", action: "已通过", tone: "success" as const, time: "昨天" },
]

export function EditorDashboard() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="负责项目数" value={12} icon={FolderKanban} href="/projects" />
        <StatCard label="待审核 Doc" value={5} icon={FileCheck2} tone="warning" href="/todos?type=review" />
        <StatCard label="退回 Doc" value={3} icon={Undo2} href="/todos?type=returned" />
        <StatCard label="即将到期项目" value={2} icon={Clock} tone="warning" />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="已逾期项目" value={1} icon={AlertTriangle} tone="danger" href="/projects?overdue=1" />
        <StatCard label="SI 草稿数量" value={4} icon={Library} href="/si?status=draft" />
        <StatCard label="预发中 SI" value={6} icon={Send} href="/si/prereleases" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">最近处理记录</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border">
          {recent.map((r, i) => (
            <div key={i} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <div className="flex items-center gap-3">
                <span className="text-sm text-foreground">{r.title}</span>
                <StatusBadge label={r.action} tone={r.tone} />
              </div>
              <span className="text-xs text-muted-foreground">{r.time}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
