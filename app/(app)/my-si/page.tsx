"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"

import { PageHeader } from "@/components/page-header"
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
import { fetchJson } from "@/lib/api"
import { PRERELEASE_STATUS_LABELS, PRERELEASE_STATUS_TONE, type PrereleaseRecord } from "@/types/si"
import { ExternalLink, Eye, Search } from "lucide-react"

type AuthorStatus = "active" | "converted"

type PreissueListResponse = {
  records: PrereleaseRecord[]
}

export default function MySiPage() {
  const [records, setRecords] = useState<PrereleaseRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState("")
  const [status, setStatus] = useState<AuthorStatus | "all">("all")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    // 作者端直接读取预发记录列表接口；服务层已保证收回记录不会出现在这里。
    setLoading(true)

    void fetchJson<PreissueListResponse>("/api/si-prepublish")
      .then((response) => {
        setRecords(response.records)
      })
      .catch((error) => {
        setErrorMessage(error instanceof Error ? error.message : "我的 SI 读取失败")
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  const filtered = useMemo(() => {
    return records.filter((record) => {
      if (keyword && !record.title.includes(keyword) && !record.trope.includes(keyword)) return false
      if (status !== "all" && record.status !== status) return false
      return true
    })
  }, [records, keyword, status])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["我的 SI"]}
        title="我的 SI"
        description="查看编辑预发给你的选题，了解选题内容与转项目状态"
      />

      {errorMessage && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {errorMessage}
        </div>
      )}

      <Card className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索 SI 标题、Trope"
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={(value) => setStatus(value as AuthorStatus | "all")}>
          <SelectTrigger className="w-40">
            <SelectValue>{status === "all" ? "全部状态" : PRERELEASE_STATUS_LABELS[status]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="active">{PRERELEASE_STATUS_LABELS.active}</SelectItem>
            <SelectItem value="converted">{PRERELEASE_STATUS_LABELS.converted}</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {loading && (
          <Card className="p-10 text-center text-sm text-muted-foreground md:col-span-2">正在加载我的 SI...</Card>
        )}
        {!loading && filtered.length === 0 && (
          <Card className="p-10 text-center text-sm text-muted-foreground md:col-span-2">
            暂无预发给你的 SI
          </Card>
        )}
        {!loading &&
          filtered.map((record) => (
            <Card key={record.recordId} className="flex flex-col gap-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <Link
                  href={`/my-si/${record.recordId}`}
                  className="text-base font-semibold text-foreground hover:text-primary hover:underline"
                >
                  {record.title}
                </Link>
                <StatusBadge
                  label={PRERELEASE_STATUS_LABELS[record.status]}
                  tone={PRERELEASE_STATUS_TONE[record.status]}
                />
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <StatusBadge label={record.mainType} tone="neutral" />
                <StatusBadge label={record.trope} tone="neutral" />
              </div>

              <div className="space-y-1.5 text-xs text-muted-foreground">
                <p>预发编辑：{record.editorName}</p>
                <p className="line-clamp-2">预发说明：{record.note || "—"}</p>
                <p>预发时间：{new Date(record.prereleasedAt).toLocaleString("zh-CN")}</p>
              </div>

              <div className="mt-auto flex items-center gap-2">
                <Button asChild size="sm" variant="outline" className="bg-transparent">
                  <Link href={`/my-si/${record.recordId}`}>
                    <Eye className="mr-1 size-3.5" />
                    查看
                  </Link>
                </Button>
                {record.status === "converted" && record.projectId && (
                  <Button asChild size="sm">
                    <Link href={`/projects/${record.projectId}`}>
                      <ExternalLink className="mr-1 size-3.5" />
                      进入项目
                    </Link>
                  </Button>
                )}
              </div>
            </Card>
          ))}
      </div>

      <p className="text-xs text-muted-foreground">
        提示：预发中的 SI 仅供查看，作者不能编辑、收回或删除，也不能决定是否转项目；已被编辑收回的记录不会显示。
      </p>
    </div>
  )
}
