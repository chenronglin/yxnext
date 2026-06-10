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
import { PROJECT_STAGE_LABELS } from "@/types/domain"
import type { ProjectDetail } from "@/types/project"

type ProjectDetailResponse = {
  project: ProjectDetail
}

export default function StagePlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { role } = useRole()
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)

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
          setMessage(error instanceof Error ? error.message : "阶段计划读取失败")
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["我的项目", project?.title ?? "阶段计划", "阶段计划"]}
        title="阶段计划"
        description={project ? `${project.title} 的四阶段计划与进度` : "正在加载阶段计划"}
      />

      {message && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{message}</div>}

      {loading ? (
        <Card className="px-4 py-10 text-center text-sm text-muted-foreground">正在加载阶段计划...</Card>
      ) : project ? (
        <>
          <Card className="p-6">
            <StageProgress project={project} />
          </Card>

          <StagePlanTable project={project} editable={false} />

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-foreground">阶段说明</h2>
            <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <span className="font-medium text-foreground">{PROJECT_STAGE_LABELS.synopsis}：</span>确认转项目后开始
              </li>
              <li className="flex gap-2">
                <span className="font-medium text-foreground">{PROJECT_STAGE_LABELS.outline}：</span>梗概通过后开始
              </li>
              <li className="flex gap-2">
                <span className="font-medium text-foreground">{PROJECT_STAGE_LABELS.chapter}：</span>细纲通过后开始
              </li>
              <li className="flex gap-2">
                <span className="font-medium text-foreground">{PROJECT_STAGE_LABELS.release}：</span>手动解锁后开始
              </li>
            </ul>
            {role !== "admin" && (
              <p className="mt-4 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                当前角色为只读视图，阶段计划参数如需调整，请由管理员在治理页统一维护。
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
