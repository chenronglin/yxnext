"use client"

import { useRole } from "@/components/role-provider"
import { PageHeader } from "@/components/page-header"
import { AdminDashboard } from "@/components/dashboard/admin-dashboard"
import { EditorDashboard } from "@/components/dashboard/editor-dashboard"
import { AuthorDashboard } from "@/components/dashboard/author-dashboard"
import { useT } from "@/hooks/use-t"

export default function DashboardPage() {
  const { user, role } = useRole()
  const t = useT()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[t("dashboard.breadcrumb")]}
        breadcrumbAriaLabel={t("common.breadcrumbs")}
        title={t("dashboard.greeting", { name: user.name })}
        description={t("dashboard.description")}
      />
      {role === "admin" && <AdminDashboard />}
      {role === "editor" && <EditorDashboard />}
      {role === "author" && <AuthorDashboard />}
    </div>
  )
}
