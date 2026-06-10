"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { fetchJson } from "@/lib/api"
import type { DocRevisionListResponse } from "@/types/doc"
import { DOC_STATUS_LABELS, HOLDER_ROLE_LABELS, ROLE_LABELS } from "@/types/domain"
import { docStatusTone, docTypeLabel, holderTone } from "@/components/doc/doc-client-shared"
import { ArrowLeft, Eye, FileText } from "lucide-react"

function revisionActionLabel(action: "author_submit" | "editor_return" | "editor_approve") {
  if (action === "author_submit") return "作者提交"
  if (action === "editor_return") return "编辑退回"
  return "编辑通过"
}

function revisionActionTone(action: "author_submit" | "editor_return" | "editor_approve") {
  if (action === "author_submit") return "info" as const
  if (action === "editor_return") return "warning" as const
  return "success" as const
}

export function DocVersionList({ projectId, docRef }: { projectId: string; docRef: string }) {
  const [response, setResponse] = useState<DocRevisionListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadRevisions() {
      setLoading(true)
      setMessage(null)

      try {
        const result = await fetchJson<DocRevisionListResponse>(`/api/docs/${docRef}/revisions`)

        if (!cancelled) {
          setResponse(result)
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "历史版本读取失败")
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadRevisions()

    return () => {
      cancelled = true
    }
  }, [docRef])

  const base = `/projects/${projectId}/docs/${docRef}`

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[response?.project.title ?? "Doc", response ? docTypeLabel(response.doc.docType) : "历史版本", "历史版本"]}
        title="历史版本"
        description={response ? `${response.doc.title} 的提交、退回与通过记录` : "正在加载历史版本"}
        actions={
          <Button asChild variant="outline" className="bg-transparent">
            <Link href={base}>
              <ArrowLeft className="mr-1.5 size-4" />
              返回当前稿件
            </Link>
          </Button>
        }
      />

      {message && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{message}</div>}

      {loading ? (
        <Card className="px-4 py-10 text-center text-sm text-muted-foreground">正在加载历史版本...</Card>
      ) : response ? (
        <>
          <Card className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
            <Field label="Doc 标题">
              <span className="text-sm font-medium text-foreground">{response.doc.title}</span>
            </Field>
            <Field label="类型">
              <StatusBadge label={docTypeLabel(response.doc.docType)} tone="neutral" />
            </Field>
            <Field label="当前状态">
              <StatusBadge label={DOC_STATUS_LABELS[response.doc.status]} tone={docStatusTone(response.doc.status)} />
            </Field>
            <Field label="当前持有人">
              <StatusBadge label={HOLDER_ROLE_LABELS[response.doc.holderRole]} tone={holderTone(response.doc.holderRole)} />
            </Field>
          </Card>

          {response.revisions.length === 0 ? (
            <Card className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
              <FileText className="size-7 opacity-40" />
              <p className="text-sm">暂无历史版本，提交或审核后将生成 Revision。</p>
            </Card>
          ) : (
            <div className="relative flex flex-col gap-4 pl-6">
              <span className="absolute bottom-2 left-2 top-2 w-px bg-border" aria-hidden />
              {response.revisions.map((revision) => (
                <Card key={revision.revisionId} className="relative p-4">
                  <span className="absolute -left-[18px] top-5 size-3 rounded-full border-2 border-background bg-primary" aria-hidden />
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-foreground">R{revision.revisionNo}</span>
                      <StatusBadge label={revisionActionLabel(revision.action)} tone={revisionActionTone(revision.action)} />
                      {revision.isFinal && <StatusBadge label="阶段有效内容" tone="success" />}
                      <span className="ml-auto text-xs text-muted-foreground">{revision.createdAt}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        操作人：<span className="text-foreground">{revision.actorName}</span>
                      </span>
                      <span>
                        角色：<span className="text-foreground">{ROLE_LABELS[revision.actorRole]}</span>
                      </span>
                      {revision.baseRevisionNo !== null && (
                        <span>
                          基于：<span className="text-foreground">R{revision.baseRevisionNo}</span>
                        </span>
                      )}
                    </div>
                    <p className="rounded-md bg-muted/50 p-2.5 text-sm text-foreground/90">{revision.handoffNote ?? "该次交接未填写说明。"}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="outline" className="bg-transparent">
                        <Link href={`${base}/versions/${revision.revisionId}`}>查看详情</Link>
                      </Button>
                      <Button asChild size="sm" variant="outline" className="bg-transparent">
                        <Link href={`${base}/clean?rev=${revision.revisionId}`}>
                          <Eye className="mr-1.5 size-3.5" />
                          Clean 预览
                        </Link>
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <Card className="px-4 py-10 text-center text-sm text-muted-foreground">Doc 不存在，或你无权访问当前历史版本。</Card>
      )}
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
