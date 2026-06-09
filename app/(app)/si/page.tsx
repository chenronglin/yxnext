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
import { PrereleaseDialog } from "@/components/si/prerelease-dialog"
import { SI_LIST, SI_STATUS_TONE, MAIN_TYPES, type SiItem } from "@/mocks/si-data"
import { SI_STATUS_LABELS, type SiStatus } from "@/types/domain"
import { Plus, Search, Eye, Pencil, Send, History, Archive, Trash2, Lock } from "lucide-react"

export default function SiLibraryPage() {
  const [keyword, setKeyword] = useState("")
  const [status, setStatus] = useState<SiStatus | "all">("all")
  const [mainType, setMainType] = useState<string>("all")
  const [dialogSi, setDialogSi] = useState<SiItem | null>(null)

  const filtered = useMemo(() => {
    return SI_LIST.filter((s) => {
      if (keyword && !s.title.includes(keyword) && !s.trope.includes(keyword)) return false
      if (status !== "all" && s.status !== status) return false
      if (mainType !== "all" && s.mainType !== mainType) return false
      return true
    })
  }, [keyword, status, mainType])

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

      {/* 筛选区 */}
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
        <div className="flex flex-wrap gap-3">
          <Select value={status} onValueChange={(v) => setStatus(v as SiStatus | "all")}>
            <SelectTrigger className="w-36">
              <SelectValue>{status === "all" ? "全部状态" : SI_STATUS_LABELS[status]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              {(Object.keys(SI_STATUS_LABELS) as SiStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {SI_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={mainType} onValueChange={setMainType}>
            <SelectTrigger className="w-36">
              <SelectValue>{mainType === "all" ? "全部类型" : mainType}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部类型</SelectItem>
              {MAIN_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* SI 列表 */}
      <div className="flex flex-col gap-3">
        {filtered.length === 0 && (
          <Card className="p-10 text-center text-sm text-muted-foreground">未找到匹配的 SI</Card>
        )}
        {filtered.map((si) => {
          const editable = si.status === "draft" || si.status === "prereleased"
          return (
            <Card key={si.id} className="flex flex-col gap-4 p-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/si/${si.id}`}
                    className="text-sm font-medium text-foreground hover:text-primary hover:underline"
                  >
                    {si.title}
                  </Link>
                  <StatusBadge label={SI_STATUS_LABELS[si.status]} tone={SI_STATUS_TONE[si.status]} />
                  {si.converted && <StatusBadge label="已转项目" tone="success" />}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>主类型：{si.mainType}</span>
                  <span>Trope：{si.trope}</span>
                  <span>适配作者：{si.authors.length > 0 ? si.authors.join("、") : "未指定"}</span>
                  <span>预发数量：{si.prereleaseCount}</span>
                  <span>更新：{si.updatedAt}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button asChild size="sm" variant="outline" className="bg-transparent">
                  <Link href={`/si/${si.id}`}>
                    <Eye className="mr-1 size-3.5" />
                    查看
                  </Link>
                </Button>
                {editable ? (
                  <Button asChild size="sm" variant="outline" className="bg-transparent">
                    <Link href={`/si/${si.id}/edit`}>
                      <Pencil className="mr-1 size-3.5" />
                      编辑
                    </Link>
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-transparent text-muted-foreground"
                    disabled
                    title="当前状态不可编辑"
                  >
                    <Pencil className="mr-1 size-3.5" />
                    编辑
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-transparent"
                  onClick={() => setDialogSi(si)}
                  disabled={si.status === "archived"}
                >
                  <Send className="mr-1 size-3.5" />
                  预发
                </Button>
                <Button asChild size="sm" variant="outline" className="bg-transparent">
                  <Link href={`/si/${si.id}/versions`}>
                    <History className="mr-1 size-3.5" />
                    版本历史
                  </Link>
                </Button>
                <Button size="sm" variant="outline" className="bg-transparent">
                  <Archive className="mr-1 size-3.5" />
                  归档
                </Button>
                {si.converted ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-transparent text-muted-foreground"
                    disabled
                    title="已转项目，不可删除"
                  >
                    <Lock className="mr-1 size-3.5" />
                    删除
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-transparent text-red-600 hover:text-red-600"
                  >
                    <Trash2 className="mr-1 size-3.5" />
                    删除
                  </Button>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      {dialogSi && (
        <PrereleaseDialog
          open={!!dialogSi}
          onOpenChange={(o) => !o && setDialogSi(null)}
          si={dialogSi}
        />
      )}
    </div>
  )
}
