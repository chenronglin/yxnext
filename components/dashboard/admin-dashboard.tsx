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
import { PROJECT_STAGE_LABELS } from "@/types/domain"

const stageCounts: Record<string, number> = {
  synopsis: 6,
  outline: 9,
  manuscript: 18,
  qc: 4,
  done: 27,
}

const authorRanking = [
  { name: "苏小白", value: "12.4 万字" },
  { name: "陈墨", value: "9.8 万字" },
  { name: "周野", value: "8.1 万字" },
  { name: "林夏", value: "6.5 万字" },
]

const editorRanking = [
  { name: "林编辑", value: "审核 42 次" },
  { name: "赵编辑", value: "审核 35 次" },
  { name: "钱编辑", value: "审核 28 次" },
]

export function AdminDashboard() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="用户总数" value={156} icon={Users} href="/admin/users" hint="编辑 24 · 作者 130" />
        <StatCard label="项目总数" value={64} icon={FolderKanban} href="/governance/projects" />
        <StatCard label="已完成项目" value={27} icon={CheckCircle2} tone="success" />
        <StatCard label="已逾期项目" value={5} icon={AlertTriangle} tone="danger" href="/governance/projects?overdue=1" />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="今日提交数" value={38} icon={FileUp} />
        <StatCard label="今日审核数" value={29} icon={FileCheck2} />
        <StatCard label="今日退回数" value={7} icon={Undo2} tone="warning" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">各阶段项目数</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {Object.entries(stageCounts).map(([stage, count]) => (
              <div key={stage} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-sm text-muted-foreground">
                  {PROJECT_STAGE_LABELS[stage as keyof typeof PROJECT_STAGE_LABELS]}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(count / 27) * 100}%` }} />
                </div>
                <span className="w-8 shrink-0 text-right text-sm font-medium text-foreground">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">作者提交排行</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5">
              {authorRanking.map((a, i) => (
                <div key={a.name} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded bg-secondary text-xs text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="text-foreground">{a.name}</span>
                  </span>
                  <span className="text-muted-foreground">{a.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">编辑效率排行</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5">
              {editorRanking.map((e, i) => (
                <div key={e.name} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded bg-secondary text-xs text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="text-foreground">{e.name}</span>
                  </span>
                  <span className="text-muted-foreground">{e.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="待审批作者" value={3} icon={UserPlus} tone="warning" href="/admin/approvals" />
        <StatCard label="逾期项目入口" value={5} icon={AlertTriangle} tone="danger" href="/governance/projects?overdue=1" />
      </div>
    </div>
  )
}
