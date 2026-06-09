"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { StatusBadge } from "@/components/status-badge"
import { STAGE_PLAN_TONE, type ProjectItem } from "@/mocks/project-data"
import { PROJECT_STAGE_LABELS, STAGE_PLAN_STATUS_LABELS } from "@/types/domain"
import { Pencil, Save, X } from "lucide-react"

interface StagePlanTableProps {
  project: ProjectItem
  // 管理员可编辑计划天数
  editable?: boolean
}

export function StagePlanTable({ project, editable = false }: StagePlanTableProps) {
  const [editing, setEditing] = useState(false)
  const [days, setDays] = useState<Record<string, number>>(
    Object.fromEntries(project.stagePlans.map((p) => [p.stage, p.planDays])),
  )

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">阶段计划</h2>
        {editable &&
          (editing ? (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-8 bg-transparent" onClick={() => setEditing(false)}>
                <X className="mr-1 size-3.5" />
                取消
              </Button>
              <Button size="sm" className="h-8" onClick={() => setEditing(false)}>
                <Save className="mr-1 size-3.5" />
                保存
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" className="h-8 bg-transparent" onClick={() => setEditing(true)}>
              <Pencil className="mr-1 size-3.5" />
              设置计划天数
            </Button>
          ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-4 py-3 font-medium">阶段</th>
              <th className="px-4 py-3 font-medium">计划天数</th>
              <th className="px-4 py-3 font-medium">计时起点</th>
              <th className="px-4 py-3 font-medium">开始时间</th>
              <th className="px-4 py-3 font-medium">截止时间</th>
              <th className="px-4 py-3 font-medium">完成时间</th>
              <th className="px-4 py-3 font-medium">状态</th>
            </tr>
          </thead>
          <tbody>
            {project.stagePlans.map((plan) => (
              <tr key={plan.stage} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-medium text-foreground">{PROJECT_STAGE_LABELS[plan.stage]}</td>
                <td className="px-4 py-3">
                  {editing ? (
                    <Input
                      type="number"
                      value={days[plan.stage]}
                      onChange={(e) => setDays({ ...days, [plan.stage]: Number(e.target.value) })}
                      className="h-8 w-20"
                    />
                  ) : (
                    <span className="text-muted-foreground">{plan.planDays} 天</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{plan.timingNote}</td>
                <td className="px-4 py-3 text-muted-foreground">{plan.startAt ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{plan.dueAt ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{plan.finishedAt ?? "—"}</td>
                <td className="px-4 py-3">
                  <StatusBadge label={STAGE_PLAN_STATUS_LABELS[plan.status]} tone={STAGE_PLAN_TONE[plan.status]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
