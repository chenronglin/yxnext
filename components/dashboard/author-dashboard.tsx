import { FolderKanban, FilePen, FileUp, Undo2, FileText, BarChart3 } from "lucide-react"
import { StatCard } from "@/components/stat-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/status-badge"

const recent = [
  { title: "《长夜未央》第 6 章", action: "已提交", tone: "info" as const, time: "30 分钟前" },
  { title: "《长夜未央》第 5 章", action: "已通过", tone: "success" as const, time: "昨天" },
  { title: "《孤星渡》梗概", action: "退回待改", tone: "warning" as const, time: "2 天前" },
]

export function AuthorDashboard() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="我的项目数" value={5} icon={FolderKanban} href="/projects" />
        <StatCard label="待修改 Doc" value={2} icon={FilePen} tone="warning" href="/todos?type=returned" />
        <StatCard label="待提交 Doc" value={3} icon={FileUp} href="/todos?type=draft" />
        <StatCard label="待处理退回稿" value={2} icon={Undo2} tone="warning" href="/todos?type=returned" />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="最近提交次数" value={14} icon={BarChart3} hint="近 30 天" />
        <StatCard label="项目累计字数" value="38.2 万" icon={FileText} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">最近提交记录</CardTitle>
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
