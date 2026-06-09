"use client"

import Link from "next/link"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { StatusBadge } from "@/components/status-badge"
import type { DocData } from "@/mocks/doc-data"
import type { Role } from "@/types/domain"
import { History, Lightbulb, MessageSquare, ArrowRight } from "lucide-react"

const PRESET_TONE = {
  delete: "danger",
  replace: "warning",
  add: "info",
  normal: "neutral",
} as const

const PRESET_LABELS = {
  delete: "删除",
  replace: "替换",
  add: "增加",
  normal: "批注",
} as const

interface CollabSidebarProps {
  doc: DocData
  role: Role
  canEditFeedback?: boolean
}

// 右侧协作栏：批注 / 编辑建议 / 交接说明 / 历史快照（P22/P24）
export function CollabSidebar({ doc, role, canEditFeedback }: CollabSidebarProps) {
  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <Tabs defaultValue="comments" className="flex h-full flex-col">
        <TabsList className="m-2 grid grid-cols-3">
          <TabsTrigger value="comments" className="text-xs">
            批注 {doc.comments.length}
          </TabsTrigger>
          <TabsTrigger value="suggestions" className="text-xs">
            建议 {doc.suggestions.length}
          </TabsTrigger>
          <TabsTrigger value="feedback" className="text-xs">
            反馈
          </TabsTrigger>
        </TabsList>

        {/* 批注列表 */}
        <TabsContent value="comments" className="flex-1 overflow-y-auto px-3 pb-3">
          {doc.comments.length === 0 ? (
            <EmptyHint icon={MessageSquare} text="暂无批注" />
          ) : (
            <div className="flex flex-col gap-2">
              {doc.comments.map((c) => (
                <div key={c.id} className="rounded-md border border-border p-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <StatusBadge label={PRESET_LABELS[c.preset]} tone={PRESET_TONE[c.preset]} />
                    <span className="text-xs text-muted-foreground">{c.createdAt}</span>
                  </div>
                  <p className="mb-1 border-l-2 border-muted-foreground/30 pl-2 text-xs text-muted-foreground">
                    “{c.quote}”
                  </p>
                  <p className="text-sm text-foreground/90">{c.body}</p>
                  <p className="mt-1.5 text-xs text-muted-foreground">{c.author}</p>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* 编辑建议列表 */}
        <TabsContent value="suggestions" className="flex-1 overflow-y-auto px-3 pb-3">
          {doc.suggestions.length === 0 ? (
            <EmptyHint icon={Lightbulb} text="暂无编辑建议" />
          ) : (
            <div className="flex flex-col gap-2">
              {doc.suggestions.map((s) => (
                <div key={s.id} className="rounded-md border border-border bg-accent/40 p-3">
                  <div className="mb-1 flex items-center gap-1.5">
                    <Lightbulb className="size-3.5 text-amber-600" />
                    <span className="text-sm font-medium text-foreground">{s.title}</span>
                  </div>
                  <p className="text-sm text-foreground/90">{s.body}</p>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {s.author} · {s.createdAt}
                  </p>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* 交接说明 / 审核反馈 / 历史快照 */}
        <TabsContent value="feedback" className="flex-1 overflow-y-auto px-3 pb-3">
          <div className="flex flex-col gap-3">
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">最近交接说明</p>
              <p className="rounded-md bg-muted/50 p-2.5 text-sm text-foreground/90">{doc.submitNote}</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">最近退回说明</p>
              <p className="rounded-md bg-amber-50 p-2.5 text-sm text-amber-800">{doc.returnNote}</p>
            </div>
            {canEditFeedback && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">审核反馈</p>
                <Textarea placeholder="填写本次审核的整体反馈…" rows={4} />
              </div>
            )}
            <Button asChild variant="outline" size="sm" className="bg-transparent">
              <Link href={`/projects/${doc.projectId}/docs/${doc.docType}/versions`}>
                <History className="mr-1.5 size-3.5" />
                查看历史快照
                <ArrowRight className="ml-auto size-3.5" />
              </Link>
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  )
}

function EmptyHint({ icon: Icon, text }: { icon: typeof MessageSquare; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
      <Icon className="size-6 opacity-40" />
      <p className="text-sm">{text}</p>
    </div>
  )
}
