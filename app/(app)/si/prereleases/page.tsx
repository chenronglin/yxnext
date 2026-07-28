"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { fetchJson } from "@/lib/api"
import { formatDateOnly } from "@/lib/utils"
import { useT } from "@/hooks/use-t"
import {
  PRERELEASE_STATUS_LABEL_KEYS,
  PRERELEASE_STATUS_TONE,
  type BoundAuthor,
  type PrereleaseRecord,
  type PrereleaseStatus,
} from "@/types/si"
import { AlertTriangle, ArrowRightCircle, ChevronLeft, ChevronRight, ExternalLink, Eye, Search, Undo2 } from "lucide-react"

type BoundAuthorsResponse = {
  authors: BoundAuthor[]
}

type PreissueListResponse = {
  records: PrereleaseRecord[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

type ConvertProjectResponse = {
  project: {
    projectId: string
  }
}

type PreissueFilterState = {
  keyword: string
  author: string
  status: PrereleaseStatus | "all"
  page: number
  pageSize: number
}

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function readFilterState(searchParams: URLSearchParams): PreissueFilterState {
  return {
    keyword: searchParams.get("keyword") ?? "",
    author: searchParams.get("authorId") ?? "all",
    status: (searchParams.get("status") as PrereleaseStatus | "all" | null) ?? "all",
    page: positiveInteger(searchParams.get("page"), 1),
    pageSize: positiveInteger(searchParams.get("pageSize"), 20),
  }
}

function buildQuery(filters: PreissueFilterState) {
  const params = new URLSearchParams()

  if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim())
  if (filters.author !== "all") params.set("authorId", filters.author)
  if (filters.status !== "all") params.set("status", filters.status)
  if (filters.page > 1) params.set("page", String(filters.page))
  if (filters.pageSize !== 20) params.set("pageSize", String(filters.pageSize))

  return params
}

export default function PrereleaseRecordsPage() {
  const t = useT()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [records, setRecords] = useState<PrereleaseRecord[]>([])
  const [authors, setAuthors] = useState<BoundAuthor[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<PreissueFilterState>(() => readFilterState(searchParams))
  const [pagination, setPagination] = useState({ page: filters.page, pageSize: filters.pageSize, total: 0, totalPages: 1 })
  const [withdrawTarget, setWithdrawTarget] = useState<PrereleaseRecord | null>(null)
  const [convertTarget, setConvertTarget] = useState<PrereleaseRecord | null>(null)
  const [projectTitle, setProjectTitle] = useState("")
  const [convertError, setConvertError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null)

  async function loadPageData(nextFilters = filters) {
    // 预发记录页依赖两份数据：记录列表本身，以及筛选下拉里展示的绑定作者列表。
    setLoading(true)
    setMessage(null)

    try {
      const params = buildQuery(nextFilters)
      const query = params.toString()
      const [recordsResponse, authorsResponse] = await Promise.all([
        fetchJson<PreissueListResponse>(query ? `/api/si-prepublish?${query}` : "/api/si-prepublish"),
        fetchJson<BoundAuthorsResponse>("/api/si/bound-authors"),
      ])

      setRecords(recordsResponse.records)
      setPagination({
        page: recordsResponse.page,
        pageSize: recordsResponse.pageSize,
        total: recordsResponse.total,
        totalPages: recordsResponse.totalPages,
      })
      setAuthors(authorsResponse.authors)
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "预发记录读取失败",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setFilters(readFilterState(searchParams))
  }, [searchParams])

  useEffect(() => {
    const nextParams = buildQuery(filters)
    const nextQuery = nextParams.toString()
    const currentQuery = searchParams.toString()

    // 预发记录的筛选条件写入 URL，方便编辑和管理员复现同一批记录。
    if (nextQuery !== currentQuery) {
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false })
    }
  }, [filters, pathname, router, searchParams])

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(async () => {
      if (cancelled) return
      await loadPageData(filters)
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [filters])

  function updateFilters(patch: Partial<PreissueFilterState>, resetPage = true) {
    setFilters((current) => ({
      ...current,
      ...patch,
      page: resetPage ? 1 : patch.page ?? current.page,
    }))
  }

  async function handleWithdraw() {
    if (!withdrawTarget || submitting) return

    setSubmitting(true)
    setMessage(null)

    try {
      // 收回完成后重新取数，确保状态、条数和筛选结果都与数据库保持一致。
      await fetchJson(`/api/si-prepublish/${withdrawTarget.recordId}/withdraw`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      })

      setMessage({
        type: "success",
        text: "预发记录已收回",
      })
      setWithdrawTarget(null)
      await loadPageData()
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "收回失败，请稍后重试",
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleConvert() {
    if (!convertTarget || submitting) return

    const normalizedProjectTitle = projectTitle.trim()

    if (!normalizedProjectTitle) {
      setConvertError("请输入项目名称")
      return
    }

    if (normalizedProjectTitle.length > 255) {
      setConvertError("项目名称不能超过 255 个字符")
      return
    }

    setSubmitting(true)
    setMessage(null)
    setConvertError(null)

    try {
      // 预发列表和 SI 详情必须提交同一个独立项目名称字段，避免不同入口再次回退为隐式复用 SI 名称。
      const response = await fetchJson<ConvertProjectResponse>(
        `/api/si-prepublish/${convertTarget.recordId}/convert-to-project`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            projectTitle: normalizedProjectTitle,
          }),
        },
      )

      setConvertTarget(null)
      setProjectTitle("")
      router.push(`/projects/${response.project.projectId}`)
      router.refresh()
    } catch (error) {
      // 错误保留在当前弹窗内，让用户可以直接修改项目名称后重试。
      setConvertError(error instanceof Error ? error.message : "转项目失败，请稍后重试")
    } finally {
      setSubmitting(false)
    }
  }

  function openConvertDialog(record: PrereleaseRecord) {
    if (submitting) return

    // 每次打开都以该条预发快照中的 SI 名称作为默认值，但项目名称状态与 SI 数据保持独立。
    setConvertTarget(record)
    setProjectTitle(record.siTitle)
    setConvertError(null)
    setMessage(null)
  }

  function closeConvertDialog() {
    if (submitting) return

    setConvertTarget(null)
    setProjectTitle("")
    setConvertError(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["SI 预发记录"]}
        title="SI 预发记录"
        description="查看你发出的所有 SI 预发记录，并执行收回、确认转项目等操作"
      />

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

      <Card className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.keyword}
            onChange={(event) => updateFilters({ keyword: event.target.value })}
            placeholder="搜索 SI 标题"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <Select value={filters.author} onValueChange={(value) => updateFilters({ author: value })}>
            <SelectTrigger className="w-36">
              <SelectValue>
                {filters.author === "all" ? "全部作者" : authors.find((item) => item.id === filters.author)?.name}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部作者</SelectItem>
              {authors.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.status} onValueChange={(value) => updateFilters({ status: value as PrereleaseStatus | "all" })}>
            <SelectTrigger className="w-36">
              <SelectValue>
                {filters.status === "all" ? "全部状态" : t(PRERELEASE_STATUS_LABEL_KEYS[filters.status])}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              {(Object.keys(PRERELEASE_STATUS_LABEL_KEYS) as PrereleaseStatus[]).map((item) => (
                <SelectItem key={item} value={item}>
                  {t(PRERELEASE_STATUS_LABEL_KEYS[item])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={String(filters.pageSize)}
            onValueChange={(value) => updateFilters({ pageSize: positiveInteger(value, 20) })}
          >
            <SelectTrigger className="w-28">
              <SelectValue>{filters.pageSize} 条/页</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {[20, 50, 100].map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} 条/页
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SI 标题</TableHead>
                <TableHead>作者</TableHead>
                <TableHead className="hidden md:table-cell">预发说明</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="hidden lg:table-cell">预发时间</TableHead>
                <TableHead>关联项目</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    正在加载预发记录...
                  </TableCell>
                </TableRow>
              )}
              {!loading && records.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    暂无符合条件的预发记录
                  </TableCell>
                </TableRow>
              )}
              {!loading &&
                records.map((record) => (
                  <TableRow key={record.recordId}>
                    <TableCell className="font-medium text-foreground">{record.siTitle}</TableCell>
                    <TableCell>{record.authorName}</TableCell>
                    <TableCell className="hidden max-w-xs truncate text-muted-foreground md:table-cell">
                      {record.note || "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        label={t(PRERELEASE_STATUS_LABEL_KEYS[record.status])}
                        tone={PRERELEASE_STATUS_TONE[record.status]}
                      />
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {formatDateOnly(record.prereleasedAt)}
                    </TableCell>
                    <TableCell>{record.projectName ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1.5">
                        <Button asChild size="sm" variant="ghost" className="h-8 px-2">
                          <Link href={`/si/${record.siId}`}>
                            <Eye className="size-3.5" />
                            <span className="sr-only">查看</span>
                          </Link>
                        </Button>
                        {record.status === "active" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 bg-transparent px-2"
                              onClick={() => setWithdrawTarget(record)}
                            >
                              <Undo2 className="mr-1 size-3.5" />
                              收回
                            </Button>
                            <Button size="sm" className="h-8 px-2" onClick={() => openConvertDialog(record)}>
                              <ArrowRightCircle className="mr-1 size-3.5" />
                              转项目
                            </Button>
                          </>
                        )}
                        {record.status === "converted" && record.projectId && (
                          <Button asChild size="sm" variant="outline" className="h-8 bg-transparent px-2">
                            <Link href={`/projects/${record.projectId}`}>
                              <ExternalLink className="mr-1 size-3.5" />
                              进入项目
                            </Link>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card className="flex flex-col gap-3 p-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>
          共 {pagination.total} 条预发记录，第 {pagination.page} / {pagination.totalPages} 页
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
            上一页
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="bg-transparent"
            disabled={loading || pagination.page >= pagination.totalPages}
            onClick={() => updateFilters({ page: Math.min(pagination.totalPages, pagination.page + 1) }, false)}
          >
            下一页
            <ChevronRight className="ml-1 size-3.5" />
          </Button>
        </div>
      </Card>

      <p className="text-xs text-muted-foreground">
        提示：确认转项目必须从某条预发记录发起，系统将自动创建项目并绑定来源 SI、编辑与作者，进入梗概阶段。已确认转项目的记录不可再次转项目，也不可收回。
      </p>

      <Dialog open={Boolean(withdrawTarget)} onOpenChange={(open) => !open && setWithdrawTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-500" />
              确认收回预发
            </DialogTitle>
            <DialogDescription>
              收回后，作者「{withdrawTarget?.authorName}」端将不再显示《{withdrawTarget?.siTitle}》的预发记录。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="bg-transparent" onClick={() => setWithdrawTarget(null)}>
              取消
            </Button>
            <Button disabled={submitting} onClick={() => void handleWithdraw()}>
              {submitting ? "处理中..." : "确认收回"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(convertTarget)}
        onOpenChange={(open) => {
          if (!open) closeConvertDialog()
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>项目命名</DialogTitle>
            <DialogDescription>
              项目名称默认使用 SI 名称，你可以在转项目前修改；后续修改项目名称也不会影响 SI 名称。
            </DialogDescription>
          </DialogHeader>

          {convertTarget && (
            <div className="flex flex-col gap-4 py-1">
              {/* 保留来源 SI 与作者信息，方便编辑在列表场景下确认当前正在转换的记录。 */}
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <p className="font-medium text-foreground">来源 SI：{convertTarget.siTitle}</p>
                <p className="mt-1 text-xs text-muted-foreground">合作作者：{convertTarget.authorName}</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="prerelease-project-title">
                  项目名称
                </label>
                <Input
                  id="prerelease-project-title"
                  value={projectTitle}
                  onChange={(event) => {
                    setProjectTitle(event.target.value)
                    setConvertError(null)
                  }}
                  maxLength={255}
                  placeholder="请输入项目名称"
                  disabled={submitting}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">该名称独立于 SI 名称，可在项目详情页随时修改。</p>
              </div>

              {convertError && (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                  {convertError}
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              className="bg-transparent"
              disabled={submitting}
              onClick={closeConvertDialog}
            >
              取消
            </Button>
            <Button disabled={submitting || !projectTitle.trim()} onClick={() => void handleConvert()}>
              {submitting ? "正在创建..." : "确认转项目"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
