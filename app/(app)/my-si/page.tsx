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
import { StatusBadge } from "@/components/status-badge"
import {
  MY_SI_VIEWS,
  PRERELEASE_STATUS_LABELS,
  PRERELEASE_STATUS_TONE,
} from "@/mocks/si-data"
import { Search, Eye, ExternalLink } from "lucide-react"

type AuthorStatus = "active" | "converted"

export default function MySiPage() {
  const [keyword, setKeyword] = useState("")
  const [status, setStatus] = useState<AuthorStatus | "all">("all")

  const filtered = useMemo(() => {
    return MY_SI_VIEWS.filter((v) => {
      if (keyword && !v.title.includes(keyword) && !v.trope.includes(keyword)) return false
      if (status !== "all" && v.status !== status) return false
      return true
    })
  }, [keyword, status])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["我的 SI"]}
        title="我的 SI"
        description="查看编辑预发给你的选题，了解选题内容与转项目状态"
      />

      <Card className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索 SI 标题、Trope"
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as AuthorStatus | "all")}>
          <SelectTrigger className="w-40">
            <SelectValue>
              {status === "all" ? "全部状态" : PRERELEASE_STATUS_LABELS[status as AuthorStatus]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="active">{PRERELEASE_STATUS_LABELS.active}</SelectItem>
            <SelectItem value="converted">{PRERELEASE_STATUS_LABELS.converted}</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {filtered.length === 0 && (
          <Card className="p-10 text-center text-sm text-muted-foreground md:col-span-2">
            暂无预发给你的 SI
          </Card>
        )}
        {filtered.map((v) => (
          <Card key={v.recordId} className="flex flex-col gap-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <Link
                href={`/my-si/${v.recordId}`}
                className="text-base font-semibold text-foreground hover:text-primary hover:underline"
              >
                {v.title}
              </Link>
              <StatusBadge label={PRERELEASE_STATUS_LABELS[v.status]} tone={PRERELEASE_STATUS_TONE[v.status]} />
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <StatusBadge label={v.mainType} tone="neutral" />
              <StatusBadge label={v.trope} tone="neutral" />
            </div>

            <div className="space-y-1.5 text-xs text-muted-foreground">
              <p>预发编辑：{v.editorName}</p>
              <p className="line-clamp-2">预发说明：{v.note}</p>
              <p>预发时间：{v.prereleasedAt}</p>
            </div>

            <div className="mt-auto flex items-center gap-2">
              <Button asChild size="sm" variant="outline" className="bg-transparent">
                <Link href={`/my-si/${v.recordId}`}>
                  <Eye className="mr-1 size-3.5" />
                  查看
                </Link>
              </Button>
              {v.status === "converted" && (
                <Button asChild size="sm">
                  <Link href={`/projects/${v.projectId}`}>
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
