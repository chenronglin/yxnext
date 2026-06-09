"use client"

import { notFound } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useRole } from "@/components/role-provider"
import { EditorInfoBar } from "@/components/doc/editor-info-bar"
import { EditorToolbar } from "@/components/doc/editor-toolbar"
import { EditorBody } from "@/components/doc/editor-body"
import { CollabSidebar } from "@/components/doc/collab-sidebar"
import { SubmitReviewDialog, ReturnReviewDialog, ApproveDialog } from "@/components/doc/review-dialogs"
import { getDoc, type DocType, DOC_TYPE_LABELS } from "@/mocks/doc-data"
import { Save, Eye, Info } from "lucide-react"

const VALID_TYPES: DocType[] = ["synopsis", "outline", "chapter", "release"]

export function DocEditor({ projectId, docType }: { projectId: string; docType: string }) {
  const { role } = useRole()
  if (!VALID_TYPES.includes(docType as DocType)) notFound()
  const doc = getDoc(projectId, docType as DocType)

  // 角色与持有人判定（演示：作者=苏小白持有作者权，编辑=持有编辑权）
  const isHolder =
    (role === "author" && doc.holder === "author") || (role === "editor" && doc.holder === "editor")
  const canEdit = isHolder && doc.status !== "approved"

  return (
    <div className="flex flex-col gap-4">
      <EditorInfoBar doc={doc} mode="current" />

      {/* 状态/角色提示 */}
      {role === "author" && (
        <StatusHint
          tone={doc.status === "returned" ? "warning" : "info"}
          text={
            doc.status === "returned"
              ? "编辑已退回，请基于退回稿与批注建议修改后重新提交。"
              : doc.status === "submitted"
                ? "已提交，等待编辑审核。提交期间正文只读。"
                : "草稿编辑中，尚未提交审核。"
          }
        />
      )}
      {role === "editor" && doc.holder === "editor" && (
        <StatusHint tone="info" text={`作者已提交待审：「${doc.submitNote}」`} />
      )}
      {!isHolder && (
        <StatusHint
          tone="neutral"
          text={`当前由${doc.holderName}持有编辑权，你只能查看。保存、提交、退回、通过等操作不可用。`}
        />
      )}

      {/* 工具栏：仅持有人可用 */}
      <EditorToolbar role={role} disabled={!canEdit} />

      {/* 主体：正文 + 协作栏 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
        <Card className="p-4 sm:p-6">
          <EditorBody blocks={doc.blocks} editable={canEdit} />
        </Card>
        <div className="lg:h-[calc(100vh-22rem)] lg:min-h-[480px]">
          <CollabSidebar doc={doc} role={role} canEditFeedback={role === "editor" && canEdit} />
        </div>
      </div>

      {/* 底部操作栏 */}
      <Card className="flex flex-wrap items-center gap-2 p-4">
        {!isHolder ? (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Eye className="size-4" />
            只读模式 · {DOC_TYPE_LABELS[doc.docType]} Doc
          </span>
        ) : role === "author" ? (
          <>
            <Button variant="outline" className="bg-transparent" disabled={!canEdit}>
              <Save className="mr-1.5 size-4" />
              保存草稿
            </Button>
            {canEdit && <SubmitReviewDialog doc={doc} />}
            <span className="ml-auto text-xs text-muted-foreground">保存时将携带 lock_version v{doc.lockVersion}</span>
          </>
        ) : (
          <>
            <Button variant="outline" className="bg-transparent" disabled={!canEdit}>
              <Save className="mr-1.5 size-4" />
              保存审稿稿
            </Button>
            {canEdit && <ReturnReviewDialog doc={doc} />}
            {canEdit && <ApproveDialog doc={doc} />}
            <span className="ml-auto text-xs text-muted-foreground">保存时将携带 lock_version v{doc.lockVersion}</span>
          </>
        )}
      </Card>
    </div>
  )
}

function StatusHint({ tone, text }: { tone: "info" | "warning" | "neutral"; text: string }) {
  const styles =
    tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : tone === "info"
        ? "border-border bg-accent/50 text-accent-foreground"
        : "border-border bg-muted/50 text-muted-foreground"
  return (
    <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${styles}`}>
      <Info className="size-4 shrink-0" />
      <span>{text}</span>
    </div>
  )
}
