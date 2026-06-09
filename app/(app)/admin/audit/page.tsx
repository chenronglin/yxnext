"use client"

import { useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { AUDIT_LOGS, AUDIT_ACTIONS, ROLE_TONE, type AuditLog } from "@/mocks/admin-data"
import { ROLE_LABELS } from "@/types/domain"
import { Search } from "lucide-react"

export default function AuditPage() {
  const [keyword, setKeyword] = useState("")
  const [action, setAction] = useState<string>("all")
  const [detail, setDetail] = useState<AuditLog | null>(null)

  const filtered = useMemo(() => {
    return AUDIT_LOGS.filter((l) => {
      if (keyword && !l.operator.includes(keyword) && !l.target.includes(keyword)) return false
      if (action !== "all" && l.action !== action) return false
      return true
    })
  }, [keyword, action])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["操作日志"]}
        title="操作日志 / 审计"
        description="记录关键业务动作，支持按操作人、操作类型、业务对象筛选审计"
      />

      {/* 筛选区 */}
      <Card className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
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
            {AUDIT_ACTIONS.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

      {/* 日志列表 */}
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
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    暂无符合条件的日志
                  </td>
                </tr>
              )}
              {filtered.map((log) => (
                <tr
                  key={log.id}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/30"
                  onClick={() => setDetail(log)}
                >
                  <td className="px-4 py-3 text-muted-foreground">{log.time}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{log.operator}</td>
                  <td className="px-4 py-3">
                    <StatusBadge label={ROLE_LABELS[log.role]} tone={ROLE_TONE[log.role]} />
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

      {/* 日志详情抽屉 */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>日志详情</DialogTitle>
            <DialogDescription>{detail?.time}</DialogDescription>
          </DialogHeader>
          {detail && (
            <dl className="grid grid-cols-3 gap-y-3 text-sm">
              <DetailRow label="操作人" value={detail.operator} />
              <DetailRow label="角色" value={ROLE_LABELS[detail.role]} />
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
