"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"

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
import { fetchJson } from "@/lib/api"
import { SI_STATUS_LABELS, type SiStatus } from "@/types/domain"
import { DEFAULT_MAIN_TYPES, SI_STATUS_TONE, type SiItem } from "@/types/si"
import { Archive, Eye, History, Lock, Pencil, Plus, Search, Send, Trash2 } from "lucide-react"

type SiListResponse = {
  items: SiItem[]
}

export default function SiLibraryPage() {
  const [items, setItems] = useState<SiItem[]>([])
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState("")
  const [status, setStatus] = useState<SiStatus | "all">("all")
  const [mainType, setMainType] = useState<string>("all")
  const [dialogSi, setDialogSi] = useState<SiItem | null>(null)
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null)

  async function loadItems() {
    // 列表页一次性取回当前编辑的 SI，再沿用现有 UI 的前端筛选体验。
    setLoading(true)

    try {
      const response = await fetchJson<SiListResponse>("/api/si")
      setItems(response.items)
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "SI 列表读取失败",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadItems()
  }, [])

  const mainTypeOptions = useMemo(() => {
    // 既保留设计稿里的固定类型，也兼容数据库里已存在但不在默认清单中的主类型。
    return Array.from(new Set([...DEFAULT_MAIN_TYPES, ...items.map((item) => item.mainType).filter(Boolean)]))
  }, [items])

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (keyword && !item.title.includes(keyword) && !item.trope.includes(keyword)) return false
      if (status !== "all" && item.status !== status) return false
      if (mainType !== "all" && item.mainType !== mainType) return false
      return true
    })
  }, [items, keyword, status, mainType])

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
            placeholder="搜索 SI 标题、Trope"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <Select value={status} onValueChange={(value) => setStatus(value as SiStatus | "all")}>
            <SelectTrigger className="w-36">
              <SelectValue>{status === "all" ? "全部状态" : SI_STATUS_LABELS[status]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              {(Object.keys(SI_STATUS_LABELS) as SiStatus[]).map((item) => (
                <SelectItem key={item} value={item}>
                  {SI_STATUS_LABELS[item]}
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
              {mainTypeOptions.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <div className="flex flex-col gap-3">
        {loading && <Card className="p-10 text-center text-sm text-muted-foreground">正在加载 SI...</Card>}
        {!loading && filtered.length === 0 && (
          <Card className="p-10 text-center text-sm text-muted-foreground">未找到匹配的 SI</Card>
        )}
        {!loading &&
          filtered.map((item) => {
            const editable = item.status === "draft" || item.status === "prereleased"

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
                    <StatusBadge label={SI_STATUS_LABELS[item.status]} tone={SI_STATUS_TONE[item.status]} />
                    {item.converted && <StatusBadge label="已转项目" tone="success" />}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>主类型：{item.mainType}</span>
                    <span>Trope：{item.trope}</span>
                    <span>适配作者：{item.authors.length > 0 ? item.authors.join("、") : "未指定"}</span>
                    <span>预发数量：{item.prereleaseCount}</span>
                    <span>更新：{new Date(item.updatedAt).toLocaleString("zh-CN")}</span>
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
                  <Button size="sm" variant="outline" className="bg-transparent text-muted-foreground" disabled>
                    <Archive className="mr-1 size-3.5" />
                    归档
                  </Button>
                  {item.converted ? (
                    <Button size="sm" variant="outline" className="bg-transparent text-muted-foreground" disabled>
                      <Lock className="mr-1 size-3.5" />
                      删除
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="bg-transparent text-muted-foreground" disabled>
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
          open={Boolean(dialogSi)}
          onOpenChange={(open) => !open && setDialogSi(null)}
          si={dialogSi}
          prereleasedAuthorIds={dialogSi.preissues.filter((item) => item.status === "active").map((item) => item.authorId)}
          onSubmitted={() => {
            setMessage({
              type: "success",
              text: "SI 已预发",
            })
            setDialogSi(null)
            void loadItems()
          }}
        />
      )}
    </div>
  )
}
