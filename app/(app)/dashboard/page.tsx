"use client"

import { useRole } from "@/components/role-provider"
import { PageHeader } from "@/components/page-header"
import { AdminDashboard } from "@/components/dashboard/admin-dashboard"
import { EditorDashboard } from "@/components/dashboard/editor-dashboard"
import { AuthorDashboard } from "@/components/dashboard/author-dashboard"

export default function DashboardPage() {
  const { user, role } = useRole()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["首页看板"]}
        title={`你好，${user.name}`}
        description="这里是你的工作概览与待处理事项"
      />
      {role === "admin" && <AdminDashboard />}
      {role === "editor" && <EditorDashboard />}
      {role === "author" && <AuthorDashboard />}
    </div>
  )
}
