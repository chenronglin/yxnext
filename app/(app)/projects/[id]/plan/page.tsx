"use client"

import Link from "next/link"
import { notFound } from "next/navigation"
import { use } from "react"
import { Card } from "@/components/ui/card"
import { PageHeader } from "@/components/page-header"
import { StagePlanTable } from "@/components/project/stage-plan-table"
import { StageProgress } from "@/components/project/stage-progress"
import { useRole } from "@/components/role-provider"
import { getProjectById } from "@/mocks/project-data"
import { PROJECT_STAGE_LABELS } from "@/types/domain"

export default function StagePlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const project = getProjectById(id)
  const { role } = useRole()
  if (!project) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["我的项目", project.title, "阶段计划"]}
        title="阶段计划"
        description={`${project.title} 的四阶段计划与进度`}
      />

      <Card className="p-6">
        <StageProgress project={project} />
      </Card>

      <StagePlanTable project={project} editable={role === "admin"} />

      {/* 阶段说明 */}
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
            当前角色为只读视图，仅管理员可修改阶段计划天数。
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
    </div>
  )
}
