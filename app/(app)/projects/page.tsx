"use client"

import { PageHeader } from "@/components/page-header"
import { ProjectList } from "@/components/project/project-list"
import { useRole } from "@/components/role-provider"
import { useT } from "@/hooks/use-t"

export default function ProjectsPage() {
  const { role } = useRole()
  const t = useT()
  const description = role === "author" ? t("projects.description.author") : t("projects.description.editor")

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[t("projects.title")]}
        breadcrumbAriaLabel={t("common.breadcrumbs")}
        title={t("projects.title")}
        description={description}
      />
      <ProjectList variant="mine" />
    </div>
  )
}
