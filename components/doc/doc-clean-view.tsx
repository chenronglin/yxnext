"use client"

import Link from "next/link"
import { notFound } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { useRole } from "@/components/role-provider"
import { getDoc, getRevision, type DocType, DOC_TYPE_LABELS } from "@/mocks/doc-data"
import { PenLine, History, Download } from "lucide-react"

const VALID_TYPES: DocType[] = ["synopsis", "outline", "chapter", "release"]

export function DocCleanView({
  projectId,
  docType,
  revisionId,
}: {
  projectId: string
  docType: string
  revisionId?: string
}) {
  const { role } = useRole()
  if (!VALID_TYPES.includes(docType as DocType)) notFound()
  const doc = getDoc(projectId, docType as DocType)
  const rev = revisionId ? getRevision(projectId, docType as DocType, revisionId) : undefined
  const base = `/projects/${projectId}/docs/${docType}`

  // 来源标签
  const sourceLabel = !rev ? "当前稿件" : rev.isFinal ? `最终 Revision · ${rev.version}` : `指定 Revision · ${rev.version}`
  const canExport = role === "editor" || role === "admin"

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumb={[doc.projectName, DOC_TYPE_LABELS[doc.docType], "阅读模式"]}
        title="阅读模式 · Clean 正文"
        description="去除全部协作标记后的最终读者视角"
        actions={
          <div className="flex flex-wrap gap-2">
            {rev ? (
              <Button asChild variant="outline" className="bg-transparent">
                <Link href={`${base}/versions`}>
                  <History className="mr-1.5 size-4" />
                  返回历史版本
                </Link>
              </Button>
            ) : (
              <Button asChild variant="outline" className="bg-transparent">
                <Link href={base}>
                  <PenLine className="mr-1.5 size-4" />
                  返回工作模式
                </Link>
              </Button>
            )}
            {canExport && (
              <Button variant="outline" className="bg-transparent">
                <Download className="mr-1.5 size-4" />
                导出
              </Button>
            )}
          </div>
        }
      />

      {/* 预览来源与字数 */}
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">预览来源</span>
          <StatusBadge label={sourceLabel} tone={rev?.isFinal ? "success" : "info"} />
        </div>
        <span className="text-sm text-muted-foreground">
          字数统计 <span className="font-medium text-foreground">{doc.words.toLocaleString()}</span> 字
        </span>
      </Card>

      {/* Clean 正文 —— 居中阅读栏宽 */}
      <Card className="p-6 sm:p-10">
        <article className="mx-auto flex max-w-2xl flex-col gap-5">
          {doc.blocks.map((b) =>
            b.kind === "heading" ? (
              <h2 key={b.id} className="text-xl font-semibold text-foreground text-balance">
                {b.text}
              </h2>
            ) : (
              <p key={b.id} className="text-[15px] leading-loose text-foreground/90 text-pretty">
                {b.text}
              </p>
            ),
          )}
        </article>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        阅读模式不可编辑，切回工作模式不会改变已保存内容。
      </p>
    </div>
  )
}
