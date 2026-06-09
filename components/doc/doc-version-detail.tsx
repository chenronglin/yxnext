"use client"

import { useState } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { EditorBody } from "@/components/doc/editor-body"
import { CollabSidebar } from "@/components/doc/collab-sidebar"
import { useRole } from "@/components/role-provider"
import {
  getDoc,
  getRevision,
  type DocType,
  DOC_TYPE_LABELS,
  REVISION_ACTION_LABELS,
  REVISION_ACTION_TONE,
} from "@/lib/doc-data"
import { ROLE_LABELS } from "@/lib/types"
import { ArrowLeft, BookOpen, PenLine } from "lucide-react"

const VALID_TYPES: DocType[] = ["synopsis", "outline", "manuscript", "qc"]

export function DocVersionDetail({
  projectId,
  docType,
  revisionId,
}: {
  projectId: string
  docType: string
  revisionId: string
}) {
  const { role } = useRole()
  const [clean, setClean] = useState(false)
  if (!VALID_TYPES.includes(docType as DocType)) notFound()
  const doc = getDoc(projectId, docType as DocType)
  const rev = getRevision(projectId, docType as DocType, revisionId)
  if (!rev) notFound()
  const base = `/projects/${projectId}/docs/${docType}`

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumb={[doc.projectName, DOC_TYPE_LABELS[doc.docType], "历史版本", rev.version]}
        title={`${rev.version} · ${doc.title}`}
        description="历史版本只读，用于回溯、对比与审计"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" className="bg-transparent" onClick={() => setClean((c) => !c)}>
              {clean ? <PenLine className="mr-1.5 size-4" /> : <BookOpen className="mr-1.5 size-4" />}
              {clean ? "工作视图" : "Clean 阅读"}
            </Button>
            <Button asChild variant="outline" className="bg-transparent">
              <Link href={`${base}/versions`}>
                <ArrowLeft className="mr-1.5 size-4" />
                返回列表
              </Link>
            </Button>
          </div>
        }
      />

      {/* Revision 信息栏 */}
      <Card className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-6">
        <Field label="版本号">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold text-foreground">{rev.version}</span>
            {rev.isFinal && <StatusBadge label="阶段有效内容" tone="success" />}
          </div>
        </Field>
        <Field label="动作类型">
          <StatusBadge label={REVISION_ACTION_LABELS[rev.action]} tone={REVISION_ACTION_TONE[rev.action]} />
        </Field>
        <Field label="操作人">
          <span className="text-sm text-foreground">
            {rev.operator}（{ROLE_LABELS[rev.operatorRole]}）
          </span>
        </Field>
        <Field label="操作时间">
          <span className="text-sm text-foreground">{rev.operatedAt}</span>
        </Field>
        <Field label="基于版本">
          <span className="text-sm text-foreground">{rev.basedOn ?? "—"}</span>
        </Field>
        <Field label="内容哈希">
          <span className="font-mono text-xs text-muted-foreground">{rev.contentHash}</span>
        </Field>
      </Card>

      {/* 提交/审核说明 */}
      <Card className="p-4">
        <p className="mb-1 text-xs font-medium text-muted-foreground">提交 / 审核说明</p>
        <p className="text-sm text-foreground/90">{rev.note}</p>
      </Card>

      {/* 只读正文 + 协作栏（clean 模式隐藏协作栏） */}
      <div className={clean ? "" : "grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]"}>
        <Card className="p-4 sm:p-6">
          {clean && <p className="mb-4 text-xs text-muted-foreground">阅读模式 · 已隐藏修订标记、批注与建议</p>}
          <EditorBody blocks={doc.blocks} editable={false} clean={clean} />
        </Card>
        {!clean && (
          <div className="lg:h-[calc(100vh-26rem)] lg:min-h-[420px]">
            <CollabSidebar doc={doc} role={role} />
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}
