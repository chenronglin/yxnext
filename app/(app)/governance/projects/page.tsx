"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"

import { PageHeader } from "@/components/page-header"
import { ProjectList } from "@/components/project/project-list"
import { fetchJson } from "@/lib/api"
import type { ProjectItem, ProjectPersonOption } from "@/types/project"

type GovernanceProjectsResponse = {
  items: ProjectItem[]
  editors: ProjectPersonOption[]
  authors: ProjectPersonOption[]
}

export default function GovernanceProjectsPage() {
  const searchParams = useSearchParams()
  const [items, setItems] = useState<ProjectItem[]>([])
  const [editors, setEditors] = useState<ProjectPersonOption[]>([])
  const [authors, setAuthors] = useState<ProjectPersonOption[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null)

  const initialFilters = useMemo(
    () => ({
      overdue: searchParams.get("overdue") === "1" ? ("yes" as const) : ("all" as const),
    }),
    [searchParams],
  )

  useEffect(() => {
    async function loadProjects() {
      // 治理列表页一次性取回所有项目，再复用现有设计稿的前端筛选体验。
      setLoading(true)
      setMessage(null)

      try {
        const response = await fetchJson<GovernanceProjectsResponse>("/api/admin/projects")
        setItems(response.items)
        setEditors(response.editors)
        setAuthors(response.authors)
      } catch (error) {
        setMessage({
          type: "error",
          text: error instanceof Error ? error.message : "项目治理列表读取失败",
        })
      } finally {
        setLoading(false)
      }
    }

    void loadProjects()
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["项目治理"]}
        title="项目治理列表"
        description="全局查看与治理所有项目，可调整归属、设置计划、归档、取消或恢复"
      />
      <ProjectList
        variant="governance"
        items={items}
        editorOptions={editors}
        authorOptions={authors}
        loading={loading}
        message={message}
        initialFilters={initialFilters}
      />
    </div>
  )
}
