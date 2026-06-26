"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { StatusBadge } from "@/components/status-badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useRole } from "@/components/role-provider"
import { fetchJson } from "@/lib/api"
import { formatDateOnly } from "@/lib/utils"
import { PROJECT_LIFECYCLE_LABEL_KEYS, PROJECT_STAGE_LABEL_KEYS, STAGE_PLAN_STATUS_LABEL_KEYS } from "@/types/domain"
import {
  PROJECT_LIFECYCLE_TONE,
  PROJECT_STAGE_TONE,
  STAGE_PLAN_TONE,
  type ProjectItem,
  type ProjectPersonOption,
} from "@/types/project"
import type { ProjectLifecycle, ProjectStage } from "@/types/domain"
import { useT } from "@/hooks/use-t"
import { ChevronLeft, ChevronRight, Download, Eye, Search, Settings2 } from "lucide-react"

interface ProjectListProps {
  variant: "governance" | "mine"
}

type ProjectListResponse = {
  items: ProjectItem[]
  editors?: ProjectPersonOption[]
  authors?: ProjectPersonOption[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

type ProjectFilterState = {
  keyword: string
  stage: ProjectStage | "all"
  lifecycle: ProjectLifecycle | "all"
  editor: string
  author: string
  overdue: "all" | "yes" | "no"
  page: number
  pageSize: number
}

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function readFilterState(searchParams: URLSearchParams): ProjectFilterState {
  const overdueParam = searchParams.get("overdue")

  return {
    keyword: searchParams.get("keyword") ?? "",
    stage: (searchParams.get("stage") as ProjectStage | "all" | null) ?? "all",
    lifecycle: (searchParams.get("lifecycle") as ProjectLifecycle | "all" | null) ?? "all",
    editor: searchParams.get("editorId") ?? "all",
    author: searchParams.get("authorId") ?? "all",
    // 兼容旧入口 /governance/projects?overdue=1，首次读入后会被规范化成 overdue=yes。
    overdue: overdueParam === "1" ? "yes" : ((overdueParam as "all" | "yes" | "no" | null) ?? "all"),
    page: positiveInteger(searchParams.get("page"), 1),
    pageSize: positiveInteger(searchParams.get("pageSize"), 20),
  }
}

function buildQuery(filters: ProjectFilterState) {
  const params = new URLSearchParams()

  if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim())
  if (filters.stage !== "all") params.set("stage", filters.stage)
  if (filters.lifecycle !== "all") params.set("lifecycle", filters.lifecycle)
  if (filters.editor !== "all") params.set("editorId", filters.editor)
  if (filters.author !== "all") params.set("authorId", filters.author)
  if (filters.overdue !== "all") params.set("overdue", filters.overdue)
  if (filters.page > 1) params.set("page", String(filters.page))
  if (filters.pageSize !== 20) params.set("pageSize", String(filters.pageSize))

  return params
}

function derivePersonOptions(items: ProjectItem[], key: "editor" | "author") {
  const map = new Map<string, ProjectPersonOption>()

  for (const item of items) {
    const id = key === "editor" ? item.editorId : item.authorId
    const name = key === "editor" ? item.editor : item.author

    if (!map.has(id)) {
      map.set(id, {
        id,
        name,
      })
    }
  }

  return [...map.values()].sort((left, right) => left.name.localeCompare(right.name, "zh-Hans-CN"))
}

export function ProjectList({ variant }: ProjectListProps) {
  const t = useT()
  const { role } = useRole()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [filters, setFilters] = useState<ProjectFilterState>(() => readFilterState(searchParams))
  const [items, setItems] = useState<ProjectItem[]>([])
  const [editors, setEditors] = useState<ProjectPersonOption[]>([])
  const [authors, setAuthors] = useState<ProjectPersonOption[]>([])
  const [pagination, setPagination] = useState({ page: filters.page, pageSize: filters.pageSize, total: 0, totalPages: 1 })
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null)
  const isGov = variant === "governance"

  useEffect(() => {
    setFilters(readFilterState(searchParams))
  }, [searchParams])

  useEffect(() => {
    const nextParams = buildQuery(filters)
    const nextQuery = nextParams.toString()
    const currentQuery = searchParams.toString()
    const target = nextQuery ? `${pathname}?${nextQuery}` : pathname

    // 筛选状态是 URL 的投影；只有和地址栏不一致时才替换，避免浏览器历史被重复写入。
    if (nextQuery !== currentQuery) {
      router.replace(target, { scroll: false })
    }
  }, [filters, pathname, router, searchParams])

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setMessage(null)

      try {
        const endpoint = variant === "governance" ? "/api/admin/projects" : "/api/projects"
        const params = buildQuery(filters)
        const query = params.toString()
        const response = await fetchJson<ProjectListResponse>(query ? `${endpoint}?${query}` : endpoint)

        if (cancelled) return

        setItems(response.items)
        setEditors(response.editors ?? derivePersonOptions(response.items, "editor"))
        setAuthors(response.authors ?? derivePersonOptions(response.items, "author"))
        setPagination({
          page: response.page,
          pageSize: response.pageSize,
          total: response.total,
          totalPages: response.totalPages,
        })
      } catch (error) {
        if (cancelled) return

        setItems([])
        setPagination((current) => ({ ...current, total: 0, totalPages: 1 }))
        setMessage({
          type: "error",
          text: error instanceof Error ? error.message : t("projects.loadFailed"),
        })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [filters, t, variant])

  const editorList = useMemo(
    () => (editors.length > 0 ? editors : derivePersonOptions(items, "editor")),
    [editors, items],
  )
  const authorList = useMemo(
    () => (authors.length > 0 ? authors : derivePersonOptions(items, "author")),
    [authors, items],
  )

  function updateFilters(patch: Partial<ProjectFilterState>, resetPage = true) {
    setFilters((current) => ({
      ...current,
      ...patch,
      page: resetPage ? 1 : patch.page ?? current.page,
    }))
  }

  return (
    <div className="flex flex-col gap-6">
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

      <Card className="flex flex-col gap-3 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.keyword}
            onChange={(event) => updateFilters({ keyword: event.target.value })}
            placeholder={t("projects.searchPlaceholder")}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <Select value={filters.stage} onValueChange={(value) => updateFilters({ stage: value as ProjectStage | "all" })}>
            <SelectTrigger className="w-32">
              <SelectValue>{filters.stage === "all" ? t("common.all") : t(PROJECT_STAGE_LABEL_KEYS[filters.stage])}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              {(Object.keys(PROJECT_STAGE_LABEL_KEYS) as ProjectStage[]).map((item) => (
                <SelectItem key={item} value={item}>
                  {t(PROJECT_STAGE_LABEL_KEYS[item])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.lifecycle}
            onValueChange={(value) => updateFilters({ lifecycle: value as ProjectLifecycle | "all" })}
          >
            <SelectTrigger className="w-32">
              <SelectValue>
                {filters.lifecycle === "all" ? t("common.all") : t(PROJECT_LIFECYCLE_LABEL_KEYS[filters.lifecycle])}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              {(Object.keys(PROJECT_LIFECYCLE_LABEL_KEYS) as ProjectLifecycle[]).map((item) => (
                <SelectItem key={item} value={item}>
                  {t(PROJECT_LIFECYCLE_LABEL_KEYS[item])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(isGov || role === "admin" || role === "author") && (
            <Select value={filters.editor} onValueChange={(value) => updateFilters({ editor: value })}>
              <SelectTrigger className="w-32">
                <SelectValue>
                  {filters.editor === "all" ? t("projects.allEditors") : editorList.find((item) => item.id === filters.editor)?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("projects.allEditors")}</SelectItem>
                {editorList.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {(isGov || role === "admin" || role === "editor") && (
            <Select value={filters.author} onValueChange={(value) => updateFilters({ author: value })}>
              <SelectTrigger className="w-32">
                <SelectValue>
                  {filters.author === "all" ? t("projects.allAuthors") : authorList.find((item) => item.id === filters.author)?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("projects.allAuthors")}</SelectItem>
                {authorList.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={filters.overdue} onValueChange={(value) => updateFilters({ overdue: value as "all" | "yes" | "no" })}>
            <SelectTrigger className="w-32">
              <SelectValue>
                {filters.overdue === "all"
                  ? t("projects.overdue.placeholder")
                  : filters.overdue === "yes"
                    ? t("projects.overdue.yes")
                    : t("projects.overdue.no")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("projects.overdue.placeholder")}</SelectItem>
              <SelectItem value="yes">{t("projects.overdue.yes")}</SelectItem>
              <SelectItem value="no">{t("projects.overdue.no")}</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={String(filters.pageSize)}
            onValueChange={(value) => updateFilters({ pageSize: positiveInteger(value, 20) })}
          >
            <SelectTrigger className="w-28">
              <SelectValue>{t("common.itemsPerPage", { count: filters.pageSize })}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {[20, 50, 100].map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {t("common.itemsPerPage", { count: size })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">{t("projects.column.title")}</th>
                <th className="px-4 py-3 font-medium">{t("projects.column.sourceSi")}</th>
                <th className="px-4 py-3 font-medium">{t("projects.column.editor")}</th>
                <th className="px-4 py-3 font-medium">{t("projects.column.author")}</th>
                <th className="px-4 py-3 font-medium">{t("projects.column.stage")}</th>
                <th className="px-4 py-3 font-medium">{t("projects.column.lifecycle")}</th>
                <th className="px-4 py-3 font-medium">{t("projects.column.planStatus")}</th>
                <th className="px-4 py-3 font-medium">{isGov ? t("projects.column.finishedAt") : t("projects.column.pending")}</th>
                <th className="px-4 py-3 font-medium">{t("projects.column.updatedAt")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("projects.column.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">
                    {t("projects.loading")}
                  </td>
                </tr>
              )}

              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">
                    {t("projects.empty")}
                  </td>
                </tr>
              )}

              {!loading &&
                items.map((project) => {
                  const detailHref = isGov ? `/governance/projects/${project.id}` : `/projects/${project.id}`

                  return (
                    <tr key={project.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Link href={detailHref} className="font-medium text-foreground hover:text-primary hover:underline">
                          {project.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{project.sourceSi}</td>
                      <td className="px-4 py-3 text-muted-foreground">{project.editor}</td>
                      <td className="px-4 py-3 text-muted-foreground">{project.author}</td>
                      <td className="px-4 py-3">
                        <StatusBadge label={t(PROJECT_STAGE_LABEL_KEYS[project.stage])} tone={PROJECT_STAGE_TONE[project.stage]} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          label={t(PROJECT_LIFECYCLE_LABEL_KEYS[project.lifecycle])}
                          tone={PROJECT_LIFECYCLE_TONE[project.lifecycle]}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge label={t(STAGE_PLAN_STATUS_LABEL_KEYS[project.planStatus])} tone={STAGE_PLAN_TONE[project.planStatus]} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {isGov ? formatDateOnly(project.finishedAt) : t("projects.pendingCount", { count: project.pendingDocs })}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDateOnly(project.updatedAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={detailHref}
                            className="inline-flex h-8 items-center rounded-md px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                            title={t("common.viewDetails")}
                          >
                            <Eye className="size-3.5" />
                          </Link>
                          {isGov && (
                            <Link
                              href={detailHref}
                              className="inline-flex h-8 items-center rounded-md px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                              title={t("common.governanceSettings")}
                            >
                              <Settings2 className="size-3.5" />
                            </Link>
                          )}
                          {!isGov && (role === "editor" || role === "admin") && (
                            <a
                              href={`/api/projects/${project.id}/export?scope=project&format=docx`}
                              className="inline-flex h-8 items-center rounded-md px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                              title={t("common.exportFinal")}
                            >
                              <Download className="size-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>
            {t("projects.paginationSummary", {
              page: pagination.page,
              total: pagination.total,
              totalPages: pagination.totalPages,
            })}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="bg-transparent"
              disabled={loading || pagination.page <= 1}
              onClick={() => updateFilters({ page: Math.max(1, pagination.page - 1) }, false)}
            >
              <ChevronLeft className="mr-1 size-3.5" />
              {t("common.previousPage")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="bg-transparent"
              disabled={loading || pagination.page >= pagination.totalPages}
              onClick={() => updateFilters({ page: Math.min(pagination.totalPages, pagination.page + 1) }, false)}
            >
              {t("common.nextPage")}
              <ChevronRight className="ml-1 size-3.5" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
