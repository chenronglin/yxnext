"use client"

import Link from "next/link"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { DocData } from "@/mocks/doc-data"
import { DOC_TYPE_LABELS, DOC_STATUS_TONE, holderTone } from "@/mocks/doc-data"
import { DOC_STATUS_LABELS, HOLDER_ROLE_LABELS } from "@/types/domain"
import { FileText, History, BookOpen } from "lucide-react"

export type EditorMode = "current" | "history" | "clean"

interface EditorInfoBarProps {
  doc: DocData
  mode: EditorMode
}

// 顶部信息栏 + 模式切换（P22）
export function EditorInfoBar({ doc, mode }: EditorInfoBarProps) {
  const base = `/projects/${doc.projectId}/docs/${doc.docType}`
  const modes: { key: EditorMode; label: string; href: string; icon: typeof FileText }[] = [
    { key: "current", label: "当前稿件", href: base, icon: FileText },
    { key: "history", label: "历史版本", href: `${base}/versions`, icon: History },
    { key: "clean", label: "阅读模式 Clean", href: `${base}/clean`, icon: BookOpen },
  ]

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link
            href={`/projects/${doc.projectId}`}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            {doc.projectName}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-foreground text-balance">{doc.title}</h1>
            <StatusBadge label={DOC_TYPE_LABELS[doc.docType]} tone="neutral" />
            <StatusBadge label={DOC_STATUS_LABELS[doc.status]} tone={DOC_STATUS_TONE[doc.status]} />
          </div>
        </div>
        {/* 模式切换 */}
        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
          {modes.map((m) => {
            const Icon = m.icon
            const active = m.key === mode
            return (
              <Button
                key={m.key}
                asChild
                size="sm"
                variant={active ? "default" : "ghost"}
                className={cn("h-8 px-3", !active && "text-muted-foreground")}
              >
                <Link href={m.href}>
                  <Icon className="mr-1.5 size-3.5" />
                  {m.label}
                </Link>
              </Button>
            )
          })}
        </div>
      </div>

      {/* 元信息行 */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
        <MetaField label="当前持有人">
          <StatusBadge label={HOLDER_ROLE_LABELS[doc.holder]} tone={holderTone(doc.holder)} />
        </MetaField>
        <MetaField label="字数">
          <span className="text-foreground">{doc.words.toLocaleString()} 字</span>
        </MetaField>
        <MetaField label="最近保存">
          <span className="text-foreground">{doc.lastSavedAt}</span>
        </MetaField>
        <MetaField label="lock_version">
          <span className="font-mono text-foreground">v{doc.lockVersion}</span>
        </MetaField>
        <MetaField label="批注 / 建议">
          <span className="text-foreground">
            {doc.comments.length} / {doc.suggestions.length}
          </span>
        </MetaField>
      </div>
    </div>
  )
}

function MetaField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}
