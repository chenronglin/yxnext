"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ChevronLeft, ChevronRight, Search } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { fetchJson } from "@/lib/api"
import { formatDateTimeToSeconds } from "@/lib/utils"
import { ROLE_LABEL_KEYS } from "@/types/domain"
import { ROLE_TONE, type AuditActionOption, type AuditLog } from "@/types/admin"
import { useT } from "@/hooks/use-t"

type AuditResponse = {
  logs: AuditLog[]
  actions: AuditActionOption[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

type AuditFilterState = {
  keyword: string
  action: string
  page: number
}

const AUDIT_PAGE_SIZE = 20

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value)

  // 地址栏参数可能被手工修改；非法页码统一回退第一页，避免把 NaN 传给接口。
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function readFilterState(searchParams: URLSearchParams): AuditFilterState {
  // 页面初始化和浏览器前进/后退都从 URL 恢复筛选条件，便于复制链接复现同一批日志。
  return {
    keyword: searchParams.get("keyword") ?? "",
    action: searchParams.get("action") ?? "all",
    page: positiveInteger(searchParams.get("page"), 1),
  }
}

function buildQuery(filters: AuditFilterState) {
  const params = new URLSearchParams()

  // 默认值不写入 URL，让第一页、全部操作类型保持简洁地址。
  if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim())
  if (filters.action !== "all") params.set("action", filters.action)
  if (filters.page > 1) params.set("page", String(filters.page))

  return params
}

export default function AuditPage() {
  const t = useT()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [actions, setActions] = useState<AuditActionOption[]>([])
  const [filters, setFilters] = useState<AuditFilterState>(() => readFilterState(searchParams))
  const [pagination, setPagination] = useState({
    page: filters.page,
    pageSize: AUDIT_PAGE_SIZE,
    total: 0,
    totalPages: 1,
  })
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<AuditLog | null>(null)
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null)

  function updateFilters(patch: Partial<AuditFilterState>, resetPage = true) {
    // 关键字或操作类型变化时回到第一页；只有翻页按钮可以显式保留目标页码。
    setFilters((current) => ({
      ...current,
      ...patch,
      page: resetPage ? 1 : patch.page ?? current.page,
    }))
  }

  useEffect(() => {
    // 浏览器前进、后退或外部链接切换查询参数时，同步更新页面筛选状态。
    setFilters(readFilterState(searchParams))
  }, [searchParams])

  useEffect(() => {
    const nextParams = buildQuery(filters)
    const nextQuery = nextParams.toString()
    const currentQuery = searchParams.toString()

    // 只在筛选状态确实变化时替换地址，避免产生重复渲染和无意义的历史记录。
    if (nextQuery !== currentQuery) {
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false })
    }
  }, [filters, pathname, router, searchParams])

  useEffect(() => {
    let cancelled = false

    // 关键字输入延迟 250 毫秒再请求，减少连续输入时产生的无效数据库查询。
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setMessage(null)

      try {
        const params = buildQuery(filters)
        const query = params.toString()
        const response = await fetchJson<AuditResponse>(query ? `/api/admin/audit?${query}` : "/api/admin/audit")

        if (cancelled) return

        setLogs(response.logs)
        setActions(response.actions)
        setPagination({
          page: response.page,
          pageSize: response.pageSize,
          total: response.total,
          totalPages: response.totalPages,
        })
      } catch (error) {
        if (cancelled) return

        setLogs([])
        setPagination((current) => ({ ...current, total: 0, totalPages: 1 }))
        setMessage({
          type: "error",
          text: error instanceof Error ? error.message : "审计日志读取失败",
        })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [filters])

  const selectedActionLabel = actions.find((item) => item.value === filters.action)?.label

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["操作日志"]}
        title="操作日志 / 审计"
        description="记录关键业务动作，支持按操作人、操作类型、业务对象筛选审计"
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
            placeholder="搜索操作人、业务对象"
            className="pl-9"
          />
        </div>
        <Select value={filters.action} onValueChange={(value) => updateFilters({ action: value })}>
          <SelectTrigger className="w-40">
            <SelectValue>{filters.action === "all" ? "全部操作类型" : selectedActionLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部操作类型</SelectItem>
            {actions.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">操作时间</th>
                <th className="px-4 py-3 font-medium">操作人</th>
                <th className="px-4 py-3 font-medium">角色</th>
                <th className="px-4 py-3 font-medium">操作类型</th>
                <th className="px-4 py-3 font-medium">业务对象</th>
                <th className="px-4 py-3 text-right font-medium">详情</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    正在加载日志...
                  </td>
                </tr>
              )}
              {!loading && logs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    暂无符合条件的日志
                  </td>
                </tr>
              )}
              {!loading &&
                logs.map((log) => (
                  <tr
                    key={log.id}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/30"
                    onClick={() => setDetail(log)}
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {formatDateTimeToSeconds(log.time)}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">{log.operator}</td>
                    <td className="px-4 py-3">
                      <StatusBadge label={t(ROLE_LABEL_KEYS[log.role])} tone={ROLE_TONE[log.role]} />
                    </td>
                    <td className="px-4 py-3 text-foreground">{log.actionLabel}</td>
                    <td className="px-4 py-3 text-muted-foreground">{log.target}</td>
                    <td className="px-4 py-3 text-right text-xs text-primary">查看</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>
            共 {pagination.total} 条日志，每页 {pagination.pageSize} 条，第 {pagination.page} / {pagination.totalPages} 页
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
        </div>
      </Card>

      <p className="text-xs text-muted-foreground">日志只读，不允许修改和删除。</p>

      <Dialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="h-[50vh] w-[50vw] max-w-[50vw] overflow-y-auto sm:max-w-[50vw]">
          <DialogHeader>
            <DialogTitle>日志详情</DialogTitle>
            <DialogDescription>{detail ? `审计记录 #${detail.id}` : "—"}</DialogDescription>
          </DialogHeader>
          {detail && (
            <dl className="grid grid-cols-3 gap-y-3 text-sm">
              <DetailRow label="操作时间" value={formatDateTimeToSeconds(detail.time)} />
              <DetailRow label="操作人" value={detail.operator} />
              <DetailRow label="角色" value={t(ROLE_LABEL_KEYS[detail.role])} />
              <DetailRow label="操作类型" value={detail.actionLabel} />
              <DetailRow label="业务对象" value={detail.target} />
              <DetailRow label="变更前 → 变更后" value={detail.changeSummary} />
              <DetailRow label="备注" value={detail.note} />
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="col-span-1 text-muted-foreground">{label}</dt>
      <dd className="col-span-2 whitespace-pre-wrap break-words text-foreground">{value}</dd>
    </>
  )
}
