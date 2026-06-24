"use client"

import { useEffect, useMemo, useState } from "react"
import { Search } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
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
import { formatDateOnly } from "@/lib/utils"
import { ROLE_LABEL_KEYS } from "@/types/domain"
import { ROLE_TONE, type AuditLog } from "@/types/admin"
import { useT } from "@/hooks/use-t"

type AuditResponse = {
  logs: AuditLog[]
  actions: string[]
}

export default function AuditPage() {
  const t = useT()
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [actions, setActions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState("")
  const [action, setAction] = useState<string>("all")
  const [detail, setDetail] = useState<AuditLog | null>(null)
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null)

  async function loadLogs() {
    // 审计页一次性读取最近日志，再由前端做关键字和动作筛选，保证交互流畅。
    setLoading(true)
    setMessage(null)

    try {
      const response = await fetchJson<AuditResponse>("/api/admin/audit")
      setLogs(response.logs)
      setActions(response.actions)
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "审计日志读取失败",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadLogs()
  }, [])

  const filtered = useMemo(() => {
    return logs.filter((log) => {
      if (keyword && !log.operator.includes(keyword) && !log.target.includes(keyword)) return false
      if (action !== "all" && log.action !== action) return false
      return true
    })
  }, [logs, keyword, action])

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
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索操作人、业务对象"
            className="pl-9"
          />
        </div>
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger className="w-40">
            <SelectValue>{action === "all" ? "全部操作类型" : action}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部操作类型</SelectItem>
            {actions.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">操作时间</th>
                <th className="px-4 py-3 font-medium">操作人</th>
                <th className="px-4 py-3 font-medium">角色</th>
                <th className="px-4 py-3 font-medium">操作类型</th>
                <th className="px-4 py-3 font-medium">业务对象</th>
                <th className="px-4 py-3 font-medium">变更前 → 变更后</th>
                <th className="px-4 py-3 text-right font-medium">详情</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    正在加载日志...
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    暂无符合条件的日志
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((log) => (
                  <tr
                    key={log.id}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/30"
                    onClick={() => setDetail(log)}
                  >
                    <td className="px-4 py-3 text-muted-foreground">{formatDateOnly(log.time)}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{log.operator}</td>
                    <td className="px-4 py-3">
                      <StatusBadge label={t(ROLE_LABEL_KEYS[log.role])} tone={ROLE_TONE[log.role]} />
                    </td>
                    <td className="px-4 py-3 text-foreground">{log.action}</td>
                    <td className="px-4 py-3 text-muted-foreground">{log.target}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {log.before} → {log.after}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-primary">查看</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-muted-foreground">日志只读，不允许修改和删除。</p>

      <Dialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>日志详情</DialogTitle>
            <DialogDescription>{detail ? formatDateOnly(detail.time) : "—"}</DialogDescription>
          </DialogHeader>
          {detail && (
            <dl className="grid grid-cols-3 gap-y-3 text-sm">
              <DetailRow label="操作人" value={detail.operator} />
              <DetailRow label="角色" value={t(ROLE_LABEL_KEYS[detail.role])} />
              <DetailRow label="操作类型" value={detail.action} />
              <DetailRow label="业务对象" value={detail.target} />
              <DetailRow label="变更前状态" value={detail.before} />
              <DetailRow label="变更后状态" value={detail.after} />
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
      <dd className="col-span-2 text-foreground">{value}</dd>
    </>
  )
}
