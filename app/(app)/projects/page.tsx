"use client"

import { PageHeader } from "@/components/page-header"
import { ProjectList } from "@/components/project/project-list"
import { useRole } from "@/components/role-provider"

export default function ProjectsPage() {
  const { role } = useRole()
  const description =
    role === "author"
      ? "查看分配给你的项目，跟踪阶段进度与待处理稿件"
      : "查看你负责的项目，跟踪阶段进度与待审稿件"

  return (
    <div className="flex flex-col gap-6">
      <PageHeader breadcrumb={["我的项目"]} title="我的项目" description={description} />
      <ProjectList variant="mine" />
    </div>
  )
}
