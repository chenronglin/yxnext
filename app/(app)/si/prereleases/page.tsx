"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

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
import {
  PRERELEASE_STATUS_LABELS,
  PRERELEASE_STATUS_TONE,
  type BoundAuthor,
  type PrereleaseRecord,
  type PrereleaseStatus,
} from "@/types/si"
import { AlertTriangle, ArrowRightCircle, ExternalLink, Eye, Search, Undo2 } from "lucide-react"

type BoundAuthorsResponse = {
  authors: BoundAuthor[]
}

type PreissueListResponse = {
  records: PrereleaseRecord[]
}

type ConvertProjectResponse = {
  project: {
    projectId: string
  }
}

export default function PrereleaseRecordsPage() {
  const router = useRouter()
  const [records, setRecords] = useState<PrereleaseRecord[]>([])
  const [authors, setAuthors] = useState<BoundAuthor[]>([])
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState("")
  const [author, setAuthor] = useState("all")
  const [status, setStatus] = useState<PrereleaseStatus | "all">("all")
  const [withdrawTarget, setWithdrawTarget] = useState<PrereleaseRecord | null>(null)
  const [convertTarget, setConvertTarget] = useState<PrereleaseRecord | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null)

  async function loadPageData() {
    // 预发记录页依赖两份数据：记录列表本身，以及筛选下拉里展示的绑定作者列表。
    setLoading(true)
    setMessage(null)

    try {
      const [recordsResponse, authorsResponse] = await Promise.all([
        fetchJson<PreissueListResponse>("/api/si-prepublish"),
        fetchJson<BoundAuthorsResponse>("/api/si/bound-authors"),
      ])

      setRecords(recordsResponse.records)
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
    void loadPageData()
  }, [])

  const filtered = useMemo(() => {
    return records.filter((record) => {
      if (keyword && !record.siTitle.includes(keyword)) return false
      if (author !== "all" && record.authorId !== author) return false
      if (status !== "all" && record.status !== status) return false
      return true
    })
  }, [records, keyword, author, status])

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

    setSubmitting(true)
    setMessage(null)

    try {
      // 转项目成功后直接进入项目页；项目创建细节不在前端拼装。
      const response = await fetchJson<ConvertProjectResponse>(
        `/api/si-prepublish/${convertTarget.recordId}/convert-to-project`,
        {
          method: "POST",
        },
      )

      setConvertTarget(null)
      router.push(`/projects/${response.project.projectId}`)
      router.refresh()
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "转项目失败，请稍后重试",
      })
      setSubmitting(false)
    }
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
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索 SI 标题"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <Select value={author} onValueChange={setAuthor}>
            <SelectTrigger className="w-36">
              <SelectValue>{author === "all" ? "全部作者" : authors.find((item) => item.id === author)?.name}</SelectValue>
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
          <Select value={status} onValueChange={(value) => setStatus(value as PrereleaseStatus | "all")}>
            <SelectTrigger className="w-36">
              <SelectValue>{status === "all" ? "全部状态" : PRERELEASE_STATUS_LABELS[status]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              {(Object.keys(PRERELEASE_STATUS_LABELS) as PrereleaseStatus[]).map((item) => (
                <SelectItem key={item} value={item}>
                  {PRERELEASE_STATUS_LABELS[item]}
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
              {!loading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    暂无符合条件的预发记录
                  </TableCell>
                </TableRow>
              )}
              {!loading &&
                filtered.map((record) => (
                  <TableRow key={record.recordId}>
                    <TableCell className="font-medium text-foreground">{record.siTitle}</TableCell>
                    <TableCell>{record.authorName}</TableCell>
                    <TableCell className="hidden max-w-xs truncate text-muted-foreground md:table-cell">
                      {record.note || "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        label={PRERELEASE_STATUS_LABELS[record.status]}
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
                            <Button size="sm" className="h-8 px-2" onClick={() => setConvertTarget(record)}>
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

      <Dialog open={Boolean(convertTarget)} onOpenChange={(open) => !open && setConvertTarget(null)}>
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
            <Button disabled={submitting} onClick={() => void handleConvert()}>
              {submitting ? "处理中..." : "确认转项目"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
