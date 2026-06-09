"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { StatusBadge } from "@/components/status-badge"
import type { DocData } from "@/mocks/doc-data"
import { DOC_STATUS_TONE } from "@/mocks/doc-data"
import { DOC_STATUS_LABELS } from "@/types/domain"
import { Send, Undo2, CheckCircle2, Info } from "lucide-react"

// 弹窗内通用：Doc 概要信息行
function DocSummary({ doc }: { doc: DocData }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md bg-muted/50 p-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">标题</span>
        <span className="font-medium text-foreground">{doc.title}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">状态</span>
        <StatusBadge label={DOC_STATUS_LABELS[doc.status]} tone={DOC_STATUS_TONE[doc.status]} />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">字数</span>
        <span className="font-medium text-foreground">{doc.words.toLocaleString()} 字</span>
      </div>
    </div>
  )
}

function HintList({ items, tone = "info" }: { items: string[]; tone?: "info" | "warning" }) {
  return (
    <ul
      className={
        tone === "warning"
          ? "flex flex-col gap-1.5 rounded-md bg-amber-50 p-3 text-sm text-amber-800"
          : "flex flex-col gap-1.5 rounded-md bg-accent/50 p-3 text-sm text-accent-foreground"
      }
    >
      {items.map((t) => (
        <li key={t} className="flex items-start gap-2">
          <Info className="mt-0.5 size-3.5 shrink-0 opacity-70" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  )
}

// P28 提交审核弹窗
export function SubmitReviewDialog({ doc }: { doc: DocData }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Send className="mr-1.5 size-4" />
        提交审核
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>提交审核</DialogTitle>
            <DialogDescription>提交后将把编辑权交接给编辑，并生成历史快照。</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <DocSummary doc={doc} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="submit-note">提交说明（可选）</Label>
              <Textarea id="submit-note" placeholder="向编辑说明本次修改要点…" rows={4} />
            </div>
            <HintList
              items={[
                "提交后编辑将获得编辑权。",
                "提交后作者暂不可编辑正文。",
                "系统将生成历史快照（author_submit Revision）。",
              ]}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" className="bg-transparent" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button onClick={() => setOpen(false)}>确认提交</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// P29 退回审核弹窗
export function ReturnReviewDialog({ doc }: { doc: DocData }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  return (
    <>
      <Button variant="outline" className="bg-transparent" onClick={() => setOpen(true)}>
        <Undo2 className="mr-1.5 size-4" />
        退回
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>退回作者修改</DialogTitle>
            <DialogDescription>退回将把编辑权交回作者，并生成历史快照。</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <DocSummary doc={doc} />
            <div className="flex items-center gap-6 text-sm">
              <span className="text-muted-foreground">
                当前批注 <span className="font-medium text-foreground">{doc.comments.length}</span>
              </span>
              <span className="text-muted-foreground">
                当前建议 <span className="font-medium text-foreground">{doc.suggestions.length}</span>
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="return-note">
                退回说明 <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="return-note"
                placeholder="请说明退回原因与修改要求（必填）…"
                rows={4}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              {reason.trim() === "" && <p className="text-xs text-red-500">退回说明不能为空。</p>}
            </div>
            <HintList
              tone="warning"
              items={["退回后作者将在当前退回内容上继续修改。", "系统将生成历史快照（editor_return Revision）。"]}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" className="bg-transparent" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button disabled={reason.trim() === ""} onClick={() => setOpen(false)}>
              确认退回
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// P30 通过确认弹窗
export function ApproveDialog({ doc }: { doc: DocData }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => setOpen(true)}>
        <CheckCircle2 className="mr-1.5 size-4" />
        通过
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认审核通过</DialogTitle>
            <DialogDescription>通过后当前内容将成为该阶段有效内容。</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <DocSummary doc={doc} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="approve-note">通过说明（可选）</Label>
              <Textarea id="approve-note" placeholder="补充通过意见…" rows={3} />
            </div>
            <HintList
              items={[
                "通过后当前内容将成为阶段有效内容（最终 Revision）。",
                "系统将生成最终历史快照（editor_approve Revision）。",
                "通过后该 Doc 默认只读。",
              ]}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" className="bg-transparent" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => setOpen(false)}>
              确认通过
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
