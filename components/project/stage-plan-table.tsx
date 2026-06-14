"use client"

import { useEffect, useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { StatusBadge } from "@/components/status-badge"
import { formatDateOnly } from "@/lib/utils"
import { STAGE_PLAN_TONE, type ProjectItem } from "@/types/project"
import { PROJECT_STAGE_LABELS, STAGE_PLAN_STATUS_LABELS } from "@/types/domain"
import { Pencil, Save, X } from "lucide-react"

interface StagePlanTableProps {
  project: ProjectItem
  // 管理员可编辑计划天数
  editable?: boolean
  // 治理页保存计划天数时，通过回调把最新值交给上层发起请求。
  onSave?: (items: Array<{ stage: "synopsis" | "outline" | "chapter" | "release"; planDays: number }>) => Promise<void> | void
  // 上层提交中时，按钮要进入禁用态，避免重复保存。
  saving?: boolean
}

export function StagePlanTable({ project, editable = false, onSave, saving = false }: StagePlanTableProps) {
  const [editing, setEditing] = useState(false)
  const [days, setDays] = useState<Record<string, number>>(
    Object.fromEntries(project.stagePlans.map((p) => [p.stage, p.planDays])),
  )

  // 项目详情重新加载后，把本地编辑缓存同步回最新后端值，避免看到旧输入框残留。
  useEffect(() => {
    setDays(Object.fromEntries(project.stagePlans.map((plan) => [plan.stage, plan.planDays])))
  }, [project.stagePlans])

  // “完成”不是可编辑阶段计划，因此表格编辑只保留四个业务阶段。
  const editablePlans = useMemo(
    () =>
      project.stagePlans.filter(
        (plan): plan is typeof plan & { stage: "synopsis" | "outline" | "chapter" | "release" } =>
          plan.stage !== "completed",
      ),
    [project.stagePlans],
  )

  async function handleSave() {
    if (!onSave) {
      setEditing(false)
      return
    }

    await onSave(
      editablePlans.map((plan) => ({
        stage: plan.stage,
        planDays: Number(days[plan.stage] ?? plan.planDays),
      })),
    )
    setEditing(false)
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">阶段计划</h2>
        {editable &&
          (editing ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 bg-transparent"
                disabled={saving}
                onClick={() => {
                  // 取消时回滚到当前 project 数据，而不是保留未提交的本地值。
                  setDays(Object.fromEntries(project.stagePlans.map((plan) => [plan.stage, plan.planDays])))
                  setEditing(false)
                }}
              >
                <X className="mr-1 size-3.5" />
                取消
              </Button>
              <Button size="sm" className="h-8" disabled={saving} onClick={() => void handleSave()}>
                <Save className="mr-1 size-3.5" />
                {saving ? "保存中..." : "保存"}
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
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-4 py-3 font-medium">阶段</th>
              <th className="px-4 py-3 font-medium">计划天数</th>
              <th className="px-4 py-3 font-medium">计时起点</th>
              <th className="px-4 py-3 font-medium">开始时间</th>
              <th className="px-4 py-3 font-medium">完成时间</th>
              <th className="px-4 py-3 font-medium">状态</th>
            </tr>
          </thead>
          <tbody>
            {project.stagePlans.map((plan) => (
              <tr key={plan.stage} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-medium text-foreground">{PROJECT_STAGE_LABELS[plan.stage]}</td>
                <td className="px-4 py-3">
                  {editing && plan.stage !== "completed" ? (
                    <Input
                      type="number"
                      value={days[plan.stage]}
                      onChange={(e) => setDays({ ...days, [plan.stage]: Number(e.target.value) })}
                      className="h-8 w-20"
                      min={1}
                    />
                  ) : (
                    <span className="text-muted-foreground">{plan.planDays} 天</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{plan.timingNote}</td>
                <td className="px-4 py-3 text-muted-foreground">{formatDateOnly(plan.startAt)}</td>
                <td className="px-4 py-3 text-muted-foreground">{formatDateOnly(plan.finishedAt)}</td>
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
