"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { use } from "react"

import { PageHeader } from "@/components/page-header"
import { Card } from "@/components/ui/card"
import { StagePlanTable } from "@/components/project/stage-plan-table"
import { StageProgress } from "@/components/project/stage-progress"
import { useRole } from "@/components/role-provider"
import { fetchJson } from "@/lib/api"
import { PROJECT_STAGE_LABEL_KEYS } from "@/types/domain"
import type { ProjectDetail } from "@/types/project"
import type { UpdateProjectStagePlansInput } from "@/types/project"
import { useT } from "@/hooks/use-t"

type ProjectDetailResponse = {
  project: ProjectDetail
}

export default function StagePlanPage({ params }: { params: Promise<{ id: string }> }) {
  const t = useT()
  const { id } = use(params)
  const { role, user } = useRole()
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadProject() {
      setLoading(true)
      setMessage(null)

      try {
        const response = await fetchJson<ProjectDetailResponse>(`/api/projects/${id}`)

        if (!cancelled) {
          setProject(response.project)
        }
      } catch (error) {
        if (!cancelled) {
          setMessage({ type: "error", text: error instanceof Error ? error.message : "阶段计划读取失败" })
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadProject()

    return () => {
      cancelled = true
    }
  }, [id])

  async function handleSave(input: UpdateProjectStagePlansInput) {
    setSaving(true)
    setMessage(null)

    try {
      const response = await fetchJson<ProjectDetailResponse>(`/api/projects/${id}/stage-plans`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      setProject(response.project)
      setMessage({ type: "success", text: "阶段计划已更新" })
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "阶段计划保存失败" })
      throw error
    } finally {
      setSaving(false)
    }
  }

  const canEdit = Boolean(project && (role === "admin" || (role === "editor" && user.id === project.editorId)))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["我的项目", project?.title ?? "阶段计划", "阶段计划"]}
        title="阶段计划"
        description={project ? `${project.title} 的四阶段计划与进度` : "正在加载阶段计划"}
      />

      {message && (
        <div
          className={
            message.type === "error"
              ? "rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600"
              : "rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
          }
        >
          {message.text}
        </div>
      )}

      {loading ? (
        <Card className="px-4 py-10 text-center text-sm text-muted-foreground">正在加载阶段计划...</Card>
      ) : project ? (
        <>
          <Card className="p-6">
            <StageProgress project={project} />
          </Card>

          <StagePlanTable project={project} editable={canEdit} saving={saving} onSave={handleSave} />

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-foreground">阶段说明</h2>
            <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <span className="font-medium text-foreground">{t(PROJECT_STAGE_LABEL_KEYS.synopsis)}：</span>确认转项目后开始
              </li>
              <li className="flex gap-2">
                <span className="font-medium text-foreground">{t(PROJECT_STAGE_LABEL_KEYS.outline)}：</span>梗概通过后开始
              </li>
              <li className="flex gap-2">
                <span className="font-medium text-foreground">{t(PROJECT_STAGE_LABEL_KEYS.chapter)}：</span>细纲通过后开始
              </li>
              <li className="flex gap-2">
                <span className="font-medium text-foreground">{t(PROJECT_STAGE_LABEL_KEYS.release)}：</span>手动解锁后开始
              </li>
            </ul>
            {!canEdit && (
              <p className="mt-4 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                当前角色为只读视图，阶段计划只能由项目负责编辑或管理员调整。
              </p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              返回
              <Link href={`/projects/${project.id}`} className="mx-1 text-primary hover:underline">
                项目详情
              </Link>
              查看完整稿件区域。
            </p>
          </Card>
        </>
      ) : (
        <Card className="px-4 py-10 text-center text-sm text-muted-foreground">项目不存在，或你无权访问当前阶段计划。</Card>
      )}
    </div>
  )
}
