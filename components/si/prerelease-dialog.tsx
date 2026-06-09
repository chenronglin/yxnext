"use client"

import { useState } from "react"
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
import { Check, Info } from "lucide-react"
import { BOUND_AUTHORS, type SiItem } from "@/lib/si-data"

interface PrereleaseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  si: Pick<SiItem, "title" | "mainType" | "trope">
  /** 已有有效预发记录的作者 id 列表 */
  prereleasedAuthorIds?: string[]
}

export function PrereleaseDialog({ open, onOpenChange, si, prereleasedAuthorIds = [] }: PrereleaseDialogProps) {
  const [selected, setSelected] = useState<string[]>([])
  const [note, setNote] = useState("")

  function toggle(id: string) {
    if (prereleasedAuthorIds.includes(id)) return
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>预发 SI</DialogTitle>
          <DialogDescription>将该选题预发给与你绑定的作者，作者端将出现对应记录</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-1">
          {/* SI 摘要 */}
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-sm font-medium text-foreground">{si.title}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <StatusBadge label={si.mainType} tone="neutral" />
              <span>{si.trope}</span>
            </div>
          </div>

          {/* 作者选择 */}
          <div className="space-y-2">
            <Label>选择作者（仅展示与你绑定的作者）</Label>
            <div className="grid grid-cols-2 gap-2">
              {BOUND_AUTHORS.map((a) => {
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
            {prereleasedAuthorIds.length > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-amber-600">
                <Info className="size-3.5" />
                灰色作者已有有效预发记录，不能重复预发
              </p>
            )}
          </div>

          {/* 预发说明 */}
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
        </div>

        <DialogFooter>
          <Button variant="outline" className="bg-transparent" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button disabled={selected.length === 0} onClick={() => onOpenChange(false)}>
            确认预发{selected.length > 0 ? `（${selected.length}）` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
