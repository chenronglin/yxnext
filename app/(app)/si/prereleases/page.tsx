"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { PageHeader } from "@/components/page-header"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { StatusBadge } from "@/components/status-badge"
import {
  PRERELEASE_RECORDS,
  PRERELEASE_STATUS_LABELS,
  PRERELEASE_STATUS_TONE,
  BOUND_AUTHORS,
  type PrereleaseStatus,
  type PrereleaseRecord,
} from "@/lib/si-data"
import { Search, Eye, Undo2, ArrowRightCircle, ExternalLink, AlertTriangle } from "lucide-react"

export default function PrereleaseRecordsPage() {
  const [keyword, setKeyword] = useState("")
  const [author, setAuthor] = useState("all")
  const [status, setStatus] = useState<PrereleaseStatus | "all">("all")
  const [withdrawTarget, setWithdrawTarget] = useState<PrereleaseRecord | null>(null)
  const [convertTarget, setConvertTarget] = useState<PrereleaseRecord | null>(null)

  const filtered = useMemo(() => {
    return PRERELEASE_RECORDS.filter((r) => {
      if (keyword && !r.siTitle.includes(keyword)) return false
      if (author !== "all" && r.authorId !== author) return false
      if (status !== "all" && r.status !== status) return false
      return true
    })
  }, [keyword, author, status])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["SI 预发记录"]}
        title="SI 预发记录"
        description="查看你发出的所有 SI 预发记录，并执行收回、确认转项目等操作"
      />

      {/* 筛选 */}
      <Card className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索 SI 标题"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <Select value={author} onValueChange={setAuthor}>
            <SelectTrigger className="w-36">
              <SelectValue>
                {author === "all" ? "全部作者" : BOUND_AUTHORS.find((a) => a.id === author)?.name}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部作者</SelectItem>
              {BOUND_AUTHORS.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => setStatus(v as PrereleaseStatus | "all")}>
            <SelectTrigger className="w-36">
              <SelectValue>
                {status === "all" ? "全部状态" : PRERELEASE_STATUS_LABELS[status]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              {(Object.keys(PRERELEASE_STATUS_LABELS) as PrereleaseStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {PRERELEASE_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* 记录表格 */}
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
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    暂无符合条件的预发记录
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium text-foreground">{r.siTitle}</TableCell>
                  <TableCell>{r.authorName}</TableCell>
                  <TableCell className="hidden max-w-xs truncate text-muted-foreground md:table-cell">
                    {r.note}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      label={PRERELEASE_STATUS_LABELS[r.status]}
                      tone={PRERELEASE_STATUS_TONE[r.status]}
                    />
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">{r.prereleasedAt}</TableCell>
                  <TableCell>{r.projectName ? r.projectName : "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1.5">
                      <Button asChild size="sm" variant="ghost" className="h-8 px-2">
                        <Link href={`/si/${r.siId}`}>
                          <Eye className="size-3.5" />
                          <span className="sr-only">查看</span>
                        </Link>
                      </Button>
                      {r.status === "active" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 bg-transparent px-2"
                            onClick={() => setWithdrawTarget(r)}
                          >
                            <Undo2 className="mr-1 size-3.5" />
                            收回
                          </Button>
                          <Button size="sm" className="h-8 px-2" onClick={() => setConvertTarget(r)}>
                            <ArrowRightCircle className="mr-1 size-3.5" />
                            转项目
                          </Button>
                        </>
                      )}
                      {r.status === "converted" && (
                        <Button asChild size="sm" variant="outline" className="h-8 bg-transparent px-2">
                          <Link href={`/projects/${r.projectId}`}>
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

      <p className="text-xs text-muted-foreground">
        提示：确认转项目必须从某条预发记录发起，系统将自动创建项目并绑定来源 SI、编辑与作者，进入梗概阶段。已确认转项目的记录不可再次转项目，也不可收回。
      </p>

      {/* 收回确认 */}
      <Dialog open={!!withdrawTarget} onOpenChange={(o) => !o && setWithdrawTarget(null)}>
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
            <Button onClick={() => setWithdrawTarget(null)}>确认收回</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 转项目确认 */}
      <Dialog open={!!convertTarget} onOpenChange={(o) => !o && setConvertTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>确认转项目</DialogTitle>
            <DialogDescription>
              将基于《{convertTarget?.siTitle}》与作者「{convertTarget?.authorName}」创建新项目，并进入梗概阶段。确认后该记录不可再次转项目。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="bg-transparent" onClick={() => setConvertTarget(null)}>
              取消
            </Button>
            <Button onClick={() => setConvertTarget(null)}>确认转项目</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
