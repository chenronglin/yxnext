"use client"

import { useEffect, useMemo, useState } from "react"
import { Pencil, Save, X } from "lucide-react"

import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useT } from "@/hooks/use-t"
import { formatDateOnly } from "@/lib/utils"
import { PROJECT_STAGE_LABEL_KEYS, STAGE_PLAN_STATUS_LABEL_KEYS } from "@/types/domain"
import {
  STAGE_PLAN_TONE,
  type ProjectItem,
  type StagePlan,
  type UpdateProjectStagePlansInput,
} from "@/types/project"

interface StagePlanTableProps {
  project: ProjectItem
  editable?: boolean
  onSave?: (input: UpdateProjectStagePlansInput) => Promise<void> | void
  saving?: boolean
}

type StageDraft = {
  start: string
  end: string
  days: number
  // 服务端负责工作日换算；记录最后编辑的是结束日还是天数，避免提交互相矛盾的值。
  driver: "days" | "end"
}

function toDateInput(value: string | null | undefined) {
  return value?.slice(0, 10) ?? ""
}

function makeDraft(plans: StagePlan[]) {
  return Object.fromEntries(
    plans.map((plan) => [
      plan.stage,
      {
        start: toDateInput(plan.plannedStartAt),
        end: toDateInput(plan.plannedEndAt),
        days: plan.planDays,
        driver: "days" as const,
      },
    ]),
  ) as Record<string, StageDraft>
}

export function StagePlanTable({ project, editable = false, onSave, saving = false }: StagePlanTableProps) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, StageDraft>>(() => makeDraft(project.stagePlans))
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDraft(makeDraft(project.stagePlans))
  }, [project.stagePlans])

  const editablePlans = useMemo(
    () =>
      project.stagePlans.filter(
        (plan): plan is typeof plan & { stage: "synopsis" | "outline" | "chapter" | "release" } =>
          plan.stage !== "completed" && plan.status !== "completed",
      ),
    [project.stagePlans],
  )
  const recentChanges = useMemo(
    () =>
      project.stagePlans
        .flatMap((plan) => (plan.changes ?? []).map((change) => ({ ...change, stage: plan.stage })))
        .sort((left, right) => right.changedAt.localeCompare(left.changedAt))
        .slice(0, 10),
    [project.stagePlans],
  )

  function cancelEditing() {
    setDraft(makeDraft(project.stagePlans))
    setReason("")
    setError(null)
    setEditing(false)
  }

  function updateDraft(stage: string, patch: Partial<StageDraft>) {
    setDraft((current) => ({
      ...current,
      [stage]: {
        ...current[stage],
        ...patch,
      },
    }))
  }

  async function handleSave() {
    if (!onSave) {
      setEditing(false)
      return
    }

    const normalizedReason = reason.trim()

    if (!normalizedReason) {
      setError("请填写计划修改原因")
      return
    }

    const changedPlans = editablePlans.filter((plan) => {
      const item = draft[plan.stage]
      return (
        item &&
        (item.start !== toDateInput(plan.plannedStartAt) ||
          item.end !== toDateInput(plan.plannedEndAt) ||
          item.days !== plan.planDays)
      )
    })

    if (changedPlans.length === 0) {
      cancelEditing()
      return
    }

    if (changedPlans.some((plan) => !draft[plan.stage]?.start)) {
      setError("修改阶段计划前请先设置计划开始日期")
      return
    }

    setError(null)
    await onSave({
      reason: normalizedReason,
      items: changedPlans.map((plan) => {
        const item = draft[plan.stage]
        const base = {
          stage: plan.stage,
          plannedStartAt: item.start,
          lockVersion: plan.lockVersion ?? 0,
        }

        return item.driver === "end" && item.end
          ? { ...base, plannedEndAt: item.end }
          : { ...base, planDays: Number(item.days) }
      }),
    })
    setReason("")
    setEditing(false)
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">{t("project.stagePlan.title")}</h2>
        {editable &&
          (editing ? (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-8 bg-transparent" disabled={saving} onClick={cancelEditing}>
                <X className="mr-1 size-3.5" />
                {t("common.cancel")}
              </Button>
              <Button size="sm" className="h-8" disabled={saving} onClick={() => void handleSave()}>
                <Save className="mr-1 size-3.5" />
                {saving ? t("common.saving") : t("common.save")}
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" className="h-8 bg-transparent" onClick={() => setEditing(true)}>
              <Pencil className="mr-1 size-3.5" />
              调整计划
            </Button>
          ))}
      </div>

      {editing && (
        <div className="grid gap-2 border-b border-border bg-muted/20 px-4 py-3">
          <Textarea
            value={reason}
            maxLength={500}
            rows={2}
            placeholder="填写本次计划调整原因（必填）"
            onChange={(event) => setReason(event.target.value)}
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-4 py-3 font-medium">{t("project.stagePlan.stage")}</th>
              <th className="px-4 py-3 font-medium">计划开始日</th>
              <th className="px-4 py-3 font-medium">计划工作日</th>
              <th className="px-4 py-3 font-medium">计划结束日</th>
              <th className="px-4 py-3 font-medium">实际开始</th>
              <th className="px-4 py-3 font-medium">实际完成</th>
              <th className="px-4 py-3 font-medium">{t("project.stagePlan.status")}</th>
            </tr>
          </thead>
          <tbody>
            {project.stagePlans.map((plan) => {
              const canEditPlan = editing && plan.stage !== "completed" && plan.status !== "completed"
              const item = draft[plan.stage]

              return (
                <tr key={plan.stage} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium text-foreground">{t(PROJECT_STAGE_LABEL_KEYS[plan.stage])}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {canEditPlan ? (
                      <Input
                        type="date"
                        className="h-8 w-36"
                        value={item?.start ?? ""}
                        onChange={(event) => updateDraft(plan.stage, { start: event.target.value })}
                      />
                    ) : (
                      formatDateOnly(plan.plannedStartAt)
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {canEditPlan ? (
                      <Input
                        type="number"
                        className="h-8 w-24"
                        min={1}
                        value={item?.days ?? plan.planDays}
                        onChange={(event) => updateDraft(plan.stage, { days: Number(event.target.value), driver: "days" })}
                      />
                    ) : (
                      <span className="text-muted-foreground">{plan.planDays} 个工作日</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {canEditPlan ? (
                      <Input
                        type="date"
                        className="h-8 w-36"
                        value={item?.end ?? ""}
                        onChange={(event) => updateDraft(plan.stage, { end: event.target.value, driver: "end" })}
                      />
                    ) : (
                      formatDateOnly(plan.plannedEndAt ?? plan.dueAt)
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDateOnly(plan.startAt)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDateOnly(plan.finishedAt)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge label={t(STAGE_PLAN_STATUS_LABEL_KEYS[plan.status])} tone={STAGE_PLAN_TONE[plan.status]} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {recentChanges.length > 0 && (
        <div className="border-t border-border px-4 py-3">
          <h3 className="text-xs font-semibold text-foreground">最近修改记录</h3>
          <div className="mt-2 grid gap-2">
            {recentChanges.map((change) => (
              <div key={change.id} className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {t(PROJECT_STAGE_LABEL_KEYS[change.stage])}：{change.reason}
                </span>
                <span>{change.changedBy} · {formatDateOnly(change.changedAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}
