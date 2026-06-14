"use client"

import { PageHeader } from "@/components/page-header"
import { ProjectList } from "@/components/project/project-list"

export default function GovernanceProjectsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["项目治理"]}
        title="项目治理列表"
        description="全局查看与治理所有项目，可调整归属、设置计划、归档、取消或恢复"
      />
      <ProjectList variant="governance" />
    </div>
  )
}
