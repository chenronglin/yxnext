"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"

import { Card } from "@/components/ui/card"
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
import { PROJECT_LIFECYCLE_LABELS, PROJECT_STAGE_LABELS } from "@/types/domain"
import {
  PROJECT_LIFECYCLE_TONE,
  PROJECT_STAGE_TONE,
  STAGE_PLAN_TONE,
  type ProjectItem,
  type ProjectPersonOption,
} from "@/types/project"
import type { ProjectLifecycle, ProjectStage } from "@/types/domain"
import { STAGE_PLAN_STATUS_LABELS } from "@/types/domain"
import { Search, Eye, Download, Settings2 } from "lucide-react"

interface ProjectListProps {
  variant: "governance" | "mine"
  items?: ProjectItem[]
  editorOptions?: ProjectPersonOption[]
  authorOptions?: ProjectPersonOption[]
  loading?: boolean
  message?: { type: "error" | "success"; text: string } | null
  initialFilters?: {
    keyword?: string
    stage?: ProjectStage | "all"
    lifecycle?: ProjectLifecycle | "all"
    editor?: string
    author?: string
    overdue?: "all" | "yes" | "no"
  }
}

type ProjectListResponse = {
  items: ProjectItem[]
  editors?: ProjectPersonOption[]
  authors?: ProjectPersonOption[]
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

export function ProjectList({
  variant,
  items,
  editorOptions,
  authorOptions,
  loading = false,
  message = null,
  initialFilters,
}: ProjectListProps) {
  const { role } = useRole()
  const [keyword, setKeyword] = useState(initialFilters?.keyword ?? "")
  const [stage, setStage] = useState<ProjectStage | "all">(initialFilters?.stage ?? "all")
  const [lifecycle, setLifecycle] = useState<ProjectLifecycle | "all">(initialFilters?.lifecycle ?? "all")
  const [editor, setEditor] = useState<string>(initialFilters?.editor ?? "all")
  const [author, setAuthor] = useState<string>(initialFilters?.author ?? "all")
  const [overdue, setOverdue] = useState<"all" | "yes" | "no">(initialFilters?.overdue ?? "all")
  const [remoteItems, setRemoteItems] = useState<ProjectItem[]>(items ?? [])
  const [remoteEditors, setRemoteEditors] = useState<ProjectPersonOption[]>(editorOptions ?? [])
  const [remoteAuthors, setRemoteAuthors] = useState<ProjectPersonOption[]>(authorOptions ?? [])
  const [remoteLoading, setRemoteLoading] = useState(false)
  const [remoteMessage, setRemoteMessage] = useState<{ type: "error" | "success"; text: string } | null>(null)

  useEffect(() => {
    setRemoteItems(items ?? [])
  }, [items])

  useEffect(() => {
    setRemoteEditors(editorOptions ?? [])
  }, [editorOptions])

  useEffect(() => {
    setRemoteAuthors(authorOptions ?? [])
  }, [authorOptions])

  useEffect(() => {
    if (items) {
      return
    }

    let cancelled = false

    async function loadProjects() {
      setRemoteLoading(true)
      setRemoteMessage(null)

      try {
        const endpoint = variant === "governance" ? "/api/admin/projects" : "/api/projects"
        const response = await fetchJson<ProjectListResponse>(endpoint)

        if (cancelled) {
          return
        }

        setRemoteItems(response.items)
        setRemoteEditors(response.editors ?? derivePersonOptions(response.items, "editor"))
        setRemoteAuthors(response.authors ?? derivePersonOptions(response.items, "author"))
      } catch (error) {
        if (cancelled) {
          return
        }

        setRemoteMessage({
          type: "error",
          text: error instanceof Error ? error.message : "项目列表读取失败",
        })
      } finally {
        if (!cancelled) {
          setRemoteLoading(false)
        }
      }
    }

    void loadProjects()

    return () => {
      cancelled = true
    }
  }, [items, variant])

  const dataItems = items ?? remoteItems
  const editorList = (editorOptions ?? remoteEditors).length > 0 ? editorOptions ?? remoteEditors : derivePersonOptions(dataItems, "editor")
  const authorList = (authorOptions ?? remoteAuthors).length > 0 ? authorOptions ?? remoteAuthors : derivePersonOptions(dataItems, "author")
  const isLoading = loading || remoteLoading
  const activeMessage = message ?? remoteMessage
  const isGov = variant === "governance"

  const filtered = useMemo(() => {
    return dataItems.filter((project) => {
      if (keyword && !project.title.includes(keyword) && !project.sourceSi.includes(keyword)) {
        return false
      }

      if (stage !== "all" && project.stage !== stage) {
        return false
      }

      if (lifecycle !== "all" && project.lifecycle !== lifecycle) {
        return false
      }

      if (editor !== "all" && project.editorId !== editor) {
        return false
      }

      if (author !== "all" && project.authorId !== author) {
        return false
      }

      if (overdue === "yes" && !project.overdue) {
        return false
      }

      if (overdue === "no" && project.overdue) {
        return false
      }

      return true
    })
  }, [author, dataItems, editor, keyword, lifecycle, overdue, stage])

  return (
    <div className="flex flex-col gap-6">
      {activeMessage && (
        <div
          className={
            activeMessage.type === "error"
              ? "rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600"
              : "rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
          }
        >
          {activeMessage.text}
        </div>
      )}

      <Card className="flex flex-col gap-3 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索项目标题、来源 SI"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <Select value={stage} onValueChange={(value) => setStage(value as ProjectStage | "all")}>
            <SelectTrigger className="w-32">
              <SelectValue>{stage === "all" ? "全部阶段" : PROJECT_STAGE_LABELS[stage]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部阶段</SelectItem>
              {(Object.keys(PROJECT_STAGE_LABELS) as ProjectStage[]).map((item) => (
                <SelectItem key={item} value={item}>
                  {PROJECT_STAGE_LABELS[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={lifecycle} onValueChange={(value) => setLifecycle(value as ProjectLifecycle | "all")}>
            <SelectTrigger className="w-32">
              <SelectValue>{lifecycle === "all" ? "全部状态" : PROJECT_LIFECYCLE_LABELS[lifecycle]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              {(Object.keys(PROJECT_LIFECYCLE_LABELS) as ProjectLifecycle[]).map((item) => (
                <SelectItem key={item} value={item}>
                  {PROJECT_LIFECYCLE_LABELS[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(isGov || role === "admin" || role === "author") && (
            <Select value={editor} onValueChange={setEditor}>
              <SelectTrigger className="w-32">
                <SelectValue>{editor === "all" ? "全部编辑" : editorList.find((item) => item.id === editor)?.name}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部编辑</SelectItem>
                {editorList.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {(isGov || role === "admin" || role === "editor") && (
            <Select value={author} onValueChange={setAuthor}>
              <SelectTrigger className="w-32">
                <SelectValue>{author === "all" ? "全部作者" : authorList.find((item) => item.id === author)?.name}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部作者</SelectItem>
                {authorList.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={overdue} onValueChange={(value) => setOverdue(value as "all" | "yes" | "no")}>
            <SelectTrigger className="w-32">
              <SelectValue>{overdue === "all" ? "是否逾期" : overdue === "yes" ? "已逾期" : "未逾期"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">是否逾期</SelectItem>
              <SelectItem value="yes">已逾期</SelectItem>
              <SelectItem value="no">未逾期</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">项目标题</th>
                <th className="px-4 py-3 font-medium">来源 SI</th>
                <th className="px-4 py-3 font-medium">负责编辑</th>
                <th className="px-4 py-3 font-medium">负责作者</th>
                <th className="px-4 py-3 font-medium">当前阶段</th>
                <th className="px-4 py-3 font-medium">生命周期</th>
                <th className="px-4 py-3 font-medium">计划状态</th>
                <th className="px-4 py-3 font-medium">{isGov ? "完成时间" : "待处理"}</th>
                <th className="px-4 py-3 font-medium">最近更新</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">
                    正在加载项目...
                  </td>
                </tr>
              )}

              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">
                    暂无符合条件的项目
                  </td>
                </tr>
              )}

              {!isLoading &&
                filtered.map((project) => {
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
                        <StatusBadge label={PROJECT_STAGE_LABELS[project.stage]} tone={PROJECT_STAGE_TONE[project.stage]} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          label={PROJECT_LIFECYCLE_LABELS[project.lifecycle]}
                          tone={PROJECT_LIFECYCLE_TONE[project.lifecycle]}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge label={STAGE_PLAN_STATUS_LABELS[project.planStatus]} tone={STAGE_PLAN_TONE[project.planStatus]} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {isGov ? project.finishedAt ?? "—" : `${project.pendingDocs} 项`}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{project.updatedAt}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={detailHref}
                            className="inline-flex h-8 items-center rounded-md px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                            title="查看详情"
                          >
                            <Eye className="size-3.5" />
                          </Link>
                          {isGov && (
                            <Link
                              href={detailHref}
                              className="inline-flex h-8 items-center rounded-md px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                              title="治理设置"
                            >
                              <Settings2 className="size-3.5" />
                            </Link>
                          )}
                          {!isGov && (role === "editor" || role === "admin") && (
                            <a
                              href={`/api/projects/${project.id}/export?scope=project&format=docx`}
                              className="inline-flex h-8 items-center rounded-md px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                              title="导出终稿"
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
      </Card>
    </div>
  )
}
