"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { StatusBadge } from "@/components/status-badge"
import { cn } from "@/lib/utils"
import { fetchJson } from "@/lib/api"
import {
  type BoundAuthor,
  type PrereleaseRecord,
  type SiItem,
} from "@/types/si"
import { Check, Info } from "lucide-react"

interface PrereleaseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  si: Pick<SiItem, "id" | "title" | "mainType" | "trope">
  /** 已有有效预发记录的作者 id 列表 */
  prereleasedAuthorIds?: string[]
  /** 预发成功后通知父组件刷新数据 */
  onSubmitted?: (records: PrereleaseRecord[]) => void
}

type BoundAuthorsResponse = {
  authors: BoundAuthor[]
}

type PrepublishResponse = {
  records: PrereleaseRecord[]
}

export function PrereleaseDialog({
  open,
  onOpenChange,
  si,
  prereleasedAuthorIds = [],
  onSubmitted,
}: PrereleaseDialogProps) {
  const [authors, setAuthors] = useState<BoundAuthor[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [note, setNote] = useState("")
  const [loadingAuthors, setLoadingAuthors] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    // 每次打开都重新读取绑定作者，保证后台刚调整绑定关系时弹窗展示的是最新结果。
    setSelected([])
    setNote("")
    setErrorMessage(null)
    setLoadingAuthors(true)

    void fetchJson<BoundAuthorsResponse>("/api/si/bound-authors")
      .then((response) => {
        setAuthors(response.authors)
      })
      .catch((error) => {
        setErrorMessage(error instanceof Error ? error.message : "绑定作者读取失败")
      })
      .finally(() => {
        setLoadingAuthors(false)
      })
  }, [open])

  function toggle(id: string) {
    if (prereleasedAuthorIds.includes(id)) return
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function handleSubmit() {
    if (selected.length === 0 || submitting) {
      return
    }

    setSubmitting(true)
    setErrorMessage(null)

    try {
      // 预发直接命中第 3 批真实接口；成功后把新记录回传给父组件决定如何刷新页面。
      const response = await fetchJson<PrepublishResponse>(`/api/si/${si.id}/prepublish`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          authorIds: selected,
          note,
        }),
      })

      onSubmitted?.(response.records)
      onOpenChange(false)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "预发失败，请稍后重试")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>预发 SI</DialogTitle>
          <DialogDescription>将该选题预发给与你绑定的作者，作者端将出现对应记录</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-1">
          {/* SI 摘要：弹窗内只展示本次预发必需的上下文，避免再堆完整详情。 */}
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-sm font-medium text-foreground">{si.title}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <StatusBadge label={si.mainType} tone="neutral" />
              <span>{si.trope}</span>
            </div>
          </div>

          {/* 作者选择：灰色项代表已有有效预发，业务上不能重复预发。 */}
          <div className="space-y-2">
            <Label>选择作者（仅展示与你绑定的作者）</Label>
            <div className="grid grid-cols-2 gap-2">
              {authors.map((a) => {
                const disabled = prereleasedAuthorIds.includes(a.id)
                const checked = selected.includes(a.id)
                return (
                  <button
                    key={a.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggle(a.id)}
                    className={cn(
                      "flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors",
                      disabled
                        ? "cursor-not-allowed border-border bg-muted text-muted-foreground"
                        : checked
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border hover:border-primary/40",
                    )}
                  >
                    <span>{a.name}</span>
                    {disabled ? (
                      <span className="text-[11px]">已预发</span>
                    ) : checked ? (
                      <Check className="size-4 text-primary" />
                    ) : null}
                  </button>
                )
              })}
            </div>
            {!loadingAuthors && authors.length === 0 && (
              <p className="text-xs text-muted-foreground">当前没有可预发的绑定作者</p>
            )}
            {prereleasedAuthorIds.length > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-amber-600">
                <Info className="size-3.5" />
                灰色作者已有有效预发记录，不能重复预发
              </p>
            )}
          </div>

          {/* 预发说明：直接写入预发记录，作者端详情页会原样展示。 */}
          <div className="space-y-2">
            <Label htmlFor="pr-note">预发说明</Label>
            <Textarea
              id="pr-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="向作者说明选题亮点、期望方向等"
              rows={3}
            />
          </div>

          <p className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-xs text-accent-foreground">
            <Info className="size-3.5 shrink-0" />
            提交后将保存当前 SI 内容快照，供后续预发记录追溯
          </p>
          {errorMessage && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
              {errorMessage}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" className="bg-transparent" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button disabled={selected.length === 0 || loadingAuthors || submitting} onClick={() => void handleSubmit()}>
            {submitting
              ? "正在预发..."
              : `确认预发${selected.length > 0 ? `（${selected.length}）` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
