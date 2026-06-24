"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { PageHeader } from "@/components/page-header"
import { PrereleaseDialog } from "@/components/si/prerelease-dialog"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useConfirmDialog, useToast } from "@/components/ui/app-feedback"
import { fetchJson } from "@/lib/api"
import { formatDateOnly } from "@/lib/utils"
import { SI_STATUS_LABEL_KEYS, type SiStatus } from "@/types/domain"
import { DEFAULT_MAIN_TYPES, SI_STATUS_TONE, type SiItem } from "@/types/si"
import { useT } from "@/hooks/use-t"
import { Archive, ChevronLeft, ChevronRight, Eye, History, Lock, Pencil, Plus, Search, Send, Trash2 } from "lucide-react"

type SiListResponse = {
  items: SiItem[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

type MainTypesResponse = {
  items: Array<{
    name: string
  }>
}

type SiFilterState = {
  keyword: string
  status: SiStatus | "all"
  mainType: string
  page: number
  pageSize: number
}

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function readFilterState(searchParams: URLSearchParams): SiFilterState {
  return {
    keyword: searchParams.get("keyword") ?? "",
    status: (searchParams.get("status") as SiStatus | "all" | null) ?? "all",
    mainType: searchParams.get("mainType") ?? "all",
    page: positiveInteger(searchParams.get("page"), 1),
    pageSize: positiveInteger(searchParams.get("pageSize"), 20),
  }
}

function buildQuery(filters: SiFilterState) {
  const params = new URLSearchParams()

  if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim())
  if (filters.status !== "all") params.set("status", filters.status)
  if (filters.mainType !== "all") params.set("mainType", filters.mainType)
  if (filters.page > 1) params.set("page", String(filters.page))
  if (filters.pageSize !== 20) params.set("pageSize", String(filters.pageSize))

  return params
}

export default function SiLibraryPage() {
  const t = useT()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const confirm = useConfirmDialog()
  const toast = useToast()
  const [items, setItems] = useState<SiItem[]>([])
  const [configuredMainTypes, setConfiguredMainTypes] = useState<string[]>(() => Array.from(DEFAULT_MAIN_TYPES))
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<SiFilterState>(() => readFilterState(searchParams))
  const [pagination, setPagination] = useState({ page: filters.page, pageSize: filters.pageSize, total: 0, totalPages: 1 })
  const [dialogSi, setDialogSi] = useState<SiItem | null>(null)
  const [workingId, setWorkingId] = useState<string | null>(null)

  const mainTypeOptions = useMemo(() => {
    // 筛选项以后台启用主类型为主，同时兼容当前页历史 SI 上仍存在的停用主类型。
    return Array.from(new Set([...configuredMainTypes, ...items.map((item) => item.mainType).filter(Boolean)]))
  }, [configuredMainTypes, items])

  function updateFilters(patch: Partial<SiFilterState>, resetPage = true) {
    setFilters((current) => ({
      ...current,
      ...patch,
      page: resetPage ? 1 : patch.page ?? current.page,
    }))
  }

  async function loadItems(nextFilters = filters) {
    setLoading(true)

    try {
      const params = buildQuery(nextFilters)
      const query = params.toString()
      const response = await fetchJson<SiListResponse>(query ? `/api/si?${query}` : "/api/si")

      setItems(response.items)
      setPagination({
        page: response.page,
        pageSize: response.pageSize,
        total: response.total,
        totalPages: response.totalPages,
      })
    } catch (error) {
      setItems([])
      setPagination((current) => ({ ...current, total: 0, totalPages: 1 }))
      toast({
        type: "error",
        title: error instanceof Error ? error.message : "SI 列表读取失败",
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleArchive(item: SiItem) {
    if (workingId) return

    const confirmed = await confirm({
      title: "确认归档 SI",
      description: `归档后《${item.title}》将不可继续编辑或预发。`,
      confirmText: "确认归档",
    })

    if (!confirmed) return

    setWorkingId(item.id)

    try {
      await fetchJson(`/api/si/${item.id}/archive`, { method: "POST" })
      toast({ type: "success", title: "SI 已归档" })
      await loadItems()
    } catch (error) {
      toast({ type: "error", title: error instanceof Error ? error.message : "归档失败，请稍后重试" })
    } finally {
      setWorkingId(null)
    }
  }

  async function handleDelete(item: SiItem) {
    if (workingId) return

    const confirmed = await confirm({
      title: "确认删除 SI",
      description: `删除《${item.title}》会同步收回活动预发、关闭待办并通知作者。该操作不可恢复。`,
      confirmText: "确认删除",
      tone: "danger",
    })

    if (!confirmed) return

    setWorkingId(item.id)

    try {
      await fetchJson(`/api/si/${item.id}`, { method: "DELETE" })
      toast({ type: "success", title: "SI 已删除" })
      await loadItems()
    } catch (error) {
      toast({ type: "error", title: error instanceof Error ? error.message : "删除失败，请稍后重试" })
    } finally {
      setWorkingId(null)
    }
  }

  useEffect(() => {
    setFilters(readFilterState(searchParams))
  }, [searchParams])

  useEffect(() => {
    const nextParams = buildQuery(filters)
    const nextQuery = nextParams.toString()
    const currentQuery = searchParams.toString()

    // SI 列表筛选以 URL 为准，方便复制链接给产品或测试复现同一页数据。
    if (nextQuery !== currentQuery) {
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false })
    }
  }, [filters, pathname, router, searchParams])

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(async () => {
      if (cancelled) return
      await loadItems(filters)
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [filters])

  useEffect(() => {
    // 列表筛选使用管理员维护的启用主类型；失败时回退到本地默认项，避免筛选条空白。
    void fetchJson<MainTypesResponse>("/api/si-main-types")
      .then((response) => {
        const activeNames = response.items.map((item) => item.name.trim()).filter(Boolean)
        setConfiguredMainTypes(activeNames.length > 0 ? activeNames : Array.from(DEFAULT_MAIN_TYPES))
      })
      .catch(() => {
        setConfiguredMainTypes(Array.from(DEFAULT_MAIN_TYPES))
      })
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["SI 选题策划库"]}
        title="SI 选题策划库"
        description="管理你创建或负责的选题策划，支持编辑、预发、查看版本"
        actions={
          <Button asChild>
            <Link href="/si/new">
              <Plus className="mr-1.5 size-4" />
              新建 SI
            </Link>
          </Button>
        }
      />

      <Card className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.keyword}
            onChange={(event) => updateFilters({ keyword: event.target.value })}
            placeholder="搜索 SI 标题、Trope"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <Select value={filters.status} onValueChange={(value) => updateFilters({ status: value as SiStatus | "all" })}>
            <SelectTrigger className="w-36">
              <SelectValue>{filters.status === "all" ? t("common.all") : t(SI_STATUS_LABEL_KEYS[filters.status])}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              {(Object.keys(SI_STATUS_LABEL_KEYS) as SiStatus[]).map((item) => (
                <SelectItem key={item} value={item}>
                  {t(SI_STATUS_LABEL_KEYS[item])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.mainType} onValueChange={(value) => updateFilters({ mainType: value })}>
            <SelectTrigger className="w-36">
              <SelectValue>{filters.mainType === "all" ? "全部类型" : filters.mainType}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部类型</SelectItem>
              {mainTypeOptions.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
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

      <div className="flex flex-col gap-3">
        {loading && <Card className="p-10 text-center text-sm text-muted-foreground">正在加载 SI...</Card>}
        {!loading && items.length === 0 && (
          <Card className="p-10 text-center text-sm text-muted-foreground">未找到匹配的 SI</Card>
        )}
        {!loading &&
          items.map((item) => {
            const editable = item.status === "draft" || item.status === "prereleased"
            const itemWorking = workingId === item.id

            return (
              <Card
                key={item.id}
                className="flex flex-col gap-4 p-4 xl:flex-row xl:items-center xl:justify-between"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/si/${item.id}`}
                      className="text-sm font-medium text-foreground hover:text-primary hover:underline"
                    >
                      {item.title}
                    </Link>
                    <StatusBadge label={t(SI_STATUS_LABEL_KEYS[item.status])} tone={SI_STATUS_TONE[item.status]} />
                    {item.converted && <StatusBadge label={t("domain.siStatus.converted")} tone="success" />}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>主类型：{item.mainType}</span>
                    <span>Trope：{item.trope}</span>
                    <span>适配作者：{item.authors.length > 0 ? item.authors.join("、") : "未指定"}</span>
                    <span>预发数量：{item.prereleaseCount}</span>
                    <span>更新：{formatDateOnly(item.updatedAt)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild size="sm" variant="outline" className="bg-transparent">
                    <Link href={`/si/${item.id}`}>
                      <Eye className="mr-1 size-3.5" />
                      查看
                    </Link>
                  </Button>
                  {editable ? (
                    <Button asChild size="sm" variant="outline" className="bg-transparent">
                      <Link href={`/si/${item.id}/edit`}>
                        <Pencil className="mr-1 size-3.5" />
                        编辑
                      </Link>
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="bg-transparent text-muted-foreground" disabled>
                      <Pencil className="mr-1 size-3.5" />
                      编辑
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-transparent"
                    onClick={() => setDialogSi(item)}
                    disabled={item.status === "archived" || item.converted}
                  >
                    <Send className="mr-1 size-3.5" />
                    预发
                  </Button>
                  <Button asChild size="sm" variant="outline" className="bg-transparent">
                    <Link href={`/si/${item.id}/versions`}>
                      <History className="mr-1 size-3.5" />
                      版本历史
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-transparent"
                    disabled={item.status === "archived" || item.converted || itemWorking}
                    onClick={() => void handleArchive(item)}
                  >
                    <Archive className="mr-1 size-3.5" />
                    {itemWorking ? "处理中..." : "归档"}
                  </Button>
                  {item.converted ? (
                    <Button size="sm" variant="outline" className="bg-transparent text-muted-foreground" disabled>
                      <Lock className="mr-1 size-3.5" />
                      删除
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-transparent"
                      disabled={itemWorking}
                      onClick={() => void handleDelete(item)}
                    >
                      <Trash2 className="mr-1 size-3.5" />
                      {itemWorking ? "处理中..." : "删除"}
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
      </div>

      <Card className="flex flex-col gap-3 p-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>
          共 {pagination.total} 个 SI，第 {pagination.page} / {pagination.totalPages} 页
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

      {dialogSi && (
        <PrereleaseDialog
          open={Boolean(dialogSi)}
          onOpenChange={(open) => !open && setDialogSi(null)}
          si={dialogSi}
          prereleasedAuthorIds={dialogSi.preissues.filter((item) => item.status === "active").map((item) => item.authorId)}
          onSubmitted={() => {
            toast({ type: "success", title: "SI 已预发" })
            setDialogSi(null)
            void loadItems()
          }}
        />
      )}
    </div>
  )
}
