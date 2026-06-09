"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { StatusBadge } from "@/components/status-badge"
import { useRole } from "@/components/role-provider"
import {
  PROJECTS,
  PROJECT_EDITORS,
  PROJECT_AUTHORS,
} from "@/mocks/project-data"
import {
  PROJECT_LIFECYCLE_LABELS,
  PROJECT_STAGE_LABELS,
  STAGE_PLAN_STATUS_LABELS,
  type ProjectLifecycle,
  type ProjectStage,
} from "@/types/domain"
import {
  PROJECT_LIFECYCLE_TONE,
  PROJECT_STAGE_TONE,
  STAGE_PLAN_TONE,
  type ProjectItem,
  type ProjectPersonOption,
} from "@/types/project"
import { Search, Eye, ArrowRight, Download, Settings2 } from "lucide-react"

interface ProjectListProps {
  // governance = 管理员治理列表（P36），mine = 我的项目（P17 编辑/作者）
  variant: "governance" | "mine"
  // 治理页接真实接口后，把项目列表和筛选器选项直接透传进来。
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

export function ProjectList({
  variant,
  items,
  editorOptions,
  authorOptions,
  loading = false,
  message = null,
  initialFilters,
}: ProjectListProps) {
  const { role, user } = useRole()
  const [keyword, setKeyword] = useState(initialFilters?.keyword ?? "")
  const [stage, setStage] = useState<ProjectStage | "all">(initialFilters?.stage ?? "all")
  const [lifecycle, setLifecycle] = useState<ProjectLifecycle | "all">(initialFilters?.lifecycle ?? "all")
  const [editor, setEditor] = useState<string>(initialFilters?.editor ?? "all")
  const [author, setAuthor] = useState<string>(initialFilters?.author ?? "all")
  const [overdue, setOverdue] = useState<string>(initialFilters?.overdue ?? "all")

  const editorList = editorOptions ?? PROJECT_EDITORS
  const authorList = authorOptions ?? PROJECT_AUTHORS

  const scoped = useMemo(() => {
    if (variant === "governance") return items ?? PROJECTS
    // 我的项目：编辑看自己负责的，作者看分配给自己的
    if (role === "editor") return PROJECTS.filter((p) => p.editor === user.name)
    if (role === "author") return PROJECTS.filter((p) => p.author === user.name)
    return PROJECTS
  }, [variant, items, role, user.name])

  const filtered = useMemo(() => {
    return scoped.filter((p) => {
      if (keyword && !p.title.includes(keyword) && !p.sourceSi.includes(keyword)) return false
      if (stage !== "all" && p.stage !== stage) return false
      if (lifecycle !== "all" && p.lifecycle !== lifecycle) return false
      if (editor !== "all" && p.editorId !== editor) return false
      if (author !== "all" && p.authorId !== author) return false
      if (overdue === "yes" && !p.overdue) return false
      if (overdue === "no" && p.overdue) return false
      return true
    })
  }, [scoped, keyword, stage, lifecycle, editor, author, overdue])

  const isGov = variant === "governance"

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

      {/* 筛选区 */}
      <Card className="flex flex-col gap-3 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索项目标题、来源 SI"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <Select value={stage} onValueChange={(v) => setStage(v as ProjectStage | "all")}>
            <SelectTrigger className="w-32">
              <SelectValue>{stage === "all" ? "全部阶段" : PROJECT_STAGE_LABELS[stage]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部阶段</SelectItem>
              {(Object.keys(PROJECT_STAGE_LABELS) as ProjectStage[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {PROJECT_STAGE_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={lifecycle} onValueChange={(v) => setLifecycle(v as ProjectLifecycle | "all")}>
            <SelectTrigger className="w-32">
              <SelectValue>
                {lifecycle === "all" ? "全部状态" : PROJECT_LIFECYCLE_LABELS[lifecycle]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              {(Object.keys(PROJECT_LIFECYCLE_LABELS) as ProjectLifecycle[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {PROJECT_LIFECYCLE_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(isGov || role === "admin" || role === "author") && (
            <Select value={editor} onValueChange={setEditor}>
              <SelectTrigger className="w-32">
                <SelectValue>
                  {editor === "all" ? "全部编辑" : editorList.find((e) => e.id === editor)?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部编辑</SelectItem>
                {editorList.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {(isGov || role === "admin" || role === "editor") && (
            <Select value={author} onValueChange={setAuthor}>
              <SelectTrigger className="w-32">
                <SelectValue>
                  {author === "all" ? "全部作者" : authorList.find((a) => a.id === author)?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部作者</SelectItem>
                {authorList.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={overdue} onValueChange={setOverdue}>
            <SelectTrigger className="w-32">
              <SelectValue>
                {overdue === "all" ? "是否逾期" : overdue === "yes" ? "已逾期" : "未逾期"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">是否逾期</SelectItem>
              <SelectItem value="yes">已逾期</SelectItem>
              <SelectItem value="no">未逾期</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* 列表 */}
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
                {isGov ? (
                  <th className="px-4 py-3 font-medium">完成时间</th>
                ) : (
                  <th className="px-4 py-3 font-medium">待处理</th>
                )}
                <th className="px-4 py-3 font-medium">最近更新</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">
                    正在加载项目...
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">
                    暂无符合条件的项目
                  </td>
                </tr>
              )}
              {!loading && filtered.map((p) => {
                const detailHref = isGov ? `/governance/projects/${p.id}` : `/projects/${p.id}`
                return (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link href={detailHref} className="font-medium text-foreground hover:text-primary hover:underline">
                        {p.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.sourceSi}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.editor}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.author}</td>
                    <td className="px-4 py-3">
                      <StatusBadge label={PROJECT_STAGE_LABELS[p.stage]} tone={PROJECT_STAGE_TONE[p.stage]} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        label={PROJECT_LIFECYCLE_LABELS[p.lifecycle]}
                        tone={PROJECT_LIFECYCLE_TONE[p.lifecycle]}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        label={STAGE_PLAN_STATUS_LABELS[p.planStatus]}
                        tone={STAGE_PLAN_TONE[p.planStatus]}
                      />
                    </td>
                    {isGov ? (
                      <td className="px-4 py-3 text-muted-foreground">{p.finishedAt ?? "—"}</td>
                    ) : (
                      <td className="px-4 py-3">
                        {p.pendingDocs > 0 ? (
                          <StatusBadge label={`${p.pendingDocs} 项`} tone="warning" />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3 text-muted-foreground">{p.updatedAt}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button asChild size="sm" variant="ghost" className="h-8 px-2">
                          <Link href={detailHref}>
                            <Eye className="size-3.5" />
                            <span className="sr-only">查看</span>
                          </Link>
                        </Button>
                        {!isGov && (
                          <Button asChild size="sm" variant="outline" className="h-8 bg-transparent">
                            <Link href={detailHref}>
                              进入阶段
                              <ArrowRight className="ml-1 size-3.5" />
                            </Link>
                          </Button>
                        )}
                        {(role === "admin" || role === "editor") && !isGov && (
                          <Button size="sm" variant="outline" className="h-8 bg-transparent">
                            <Download className="size-3.5" />
                            <span className="sr-only">导出</span>
                          </Button>
                        )}
                        {isGov && (
                          <Button asChild size="sm" variant="outline" className="h-8 bg-transparent">
                            <Link href={detailHref}>
                              <Settings2 className="mr-1 size-3.5" />
                              治理
                            </Link>
                          </Button>
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
