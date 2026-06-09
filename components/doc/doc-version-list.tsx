"use client"

import Link from "next/link"
import { notFound } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import {
  getDoc,
  type DocType,
  DOC_TYPE_LABELS,
  DOC_STATUS_TONE,
  REVISION_ACTION_LABELS,
  REVISION_ACTION_TONE,
  holderTone,
} from "@/mocks/doc-data"
import { DOC_STATUS_LABELS, HOLDER_ROLE_LABELS, ROLE_LABELS } from "@/types/domain"
import { FileText, Eye, GitCompare, ArrowLeft } from "lucide-react"

const VALID_TYPES: DocType[] = ["synopsis", "outline", "manuscript", "qc"]

export function DocVersionList({ projectId, docType }: { projectId: string; docType: string }) {
  if (!VALID_TYPES.includes(docType as DocType)) notFound()
  const doc = getDoc(projectId, docType as DocType)
  const base = `/projects/${projectId}/docs/${docType}`
  // 最新在前
  const revisions = [...doc.revisions].reverse()
  const finalRev = doc.revisions.find((r) => r.isFinal)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[doc.projectName, DOC_TYPE_LABELS[doc.docType], "历史版本"]}
        title="历史版本"
        description={`${doc.title} 的提交、退回与通过记录`}
        actions={
          <Button asChild variant="outline" className="bg-transparent">
            <Link href={base}>
              <ArrowLeft className="mr-1.5 size-4" />
              返回当前稿件
            </Link>
          </Button>
        }
      />

      {/* Doc 基础信息 */}
      <Card className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
        <Field label="Doc 标题">
          <span className="text-sm font-medium text-foreground">{doc.title}</span>
        </Field>
        <Field label="类型">
          <StatusBadge label={DOC_TYPE_LABELS[doc.docType]} tone="neutral" />
        </Field>
        <Field label="当前状态">
          <StatusBadge label={DOC_STATUS_LABELS[doc.status]} tone={DOC_STATUS_TONE[doc.status]} />
        </Field>
        <Field label="当前持有人">
          <StatusBadge label={HOLDER_ROLE_LABELS[doc.holder]} tone={holderTone(doc.holder)} />
        </Field>
        <Field label="最终 Revision">
          {finalRev ? (
            <span className="text-sm text-foreground">{finalRev.version}</span>
          ) : (
            <span className="text-sm text-muted-foreground">尚无</span>
          )}
        </Field>
      </Card>

      {/* Revision 时间轴 */}
      {revisions.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
          <FileText className="size-7 opacity-40" />
          <p className="text-sm">暂无历史版本，提交或审核后将生成 Revision。</p>
        </Card>
      ) : (
        <div className="relative flex flex-col gap-4 pl-6">
          <span className="absolute left-2 top-2 bottom-2 w-px bg-border" aria-hidden />
          {revisions.map((r) => (
            <Card key={r.id} className="relative p-4">
              <span
                className="absolute -left-[18px] top-5 size-3 rounded-full border-2 border-background bg-primary"
                aria-hidden
              />
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-foreground">{r.version}</span>
                  <StatusBadge label={REVISION_ACTION_LABELS[r.action]} tone={REVISION_ACTION_TONE[r.action]} />
                  {r.isFinal && <StatusBadge label="阶段有效内容" tone="success" />}
                  <span className="ml-auto text-xs text-muted-foreground">{r.operatedAt}</span>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    操作人：<span className="text-foreground">{r.operator}</span>
                  </span>
                  <span>
                    角色：<span className="text-foreground">{ROLE_LABELS[r.operatorRole]}</span>
                  </span>
                  {r.basedOn && (
                    <span>
                      基于：<span className="text-foreground">{r.basedOn}</span>
                    </span>
                  )}
                </div>
                <p className="rounded-md bg-muted/50 p-2.5 text-sm text-foreground/90">{r.note}</p>
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline" className="bg-transparent">
                    <Link href={`${base}/versions/${r.id}`}>
                      <FileText className="mr-1.5 size-3.5" />
                      查看
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline" className="bg-transparent">
                    <Link href={`${base}/clean?rev=${r.id}`}>
                      <Eye className="mr-1.5 size-3.5" />
                      Clean 预览
                    </Link>
                  </Button>
                  <Button size="sm" variant="ghost" className="text-muted-foreground" title="与其他版本对比">
                    <GitCompare className="mr-1.5 size-3.5" />
                    对比
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">历史版本始终只读，编辑请前往当前稿件。</p>
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
