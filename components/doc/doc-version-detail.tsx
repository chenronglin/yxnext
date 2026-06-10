"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { fetchJson } from "@/lib/api"
import type { DocRevisionDetail } from "@/types/doc"
import { ROLE_LABELS } from "@/types/domain"
import { docTypeLabel } from "@/components/doc/doc-client-shared"
import { ArrowLeft, BookOpen, PenLine } from "lucide-react"

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

export function DocVersionDetail({
  projectId,
  docRef,
  revisionId,
}: {
  projectId: string
  docRef: string
  revisionId: string
}) {
  const [detail, setDetail] = useState<DocRevisionDetail | null>(null)
  const [clean, setClean] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadDetail() {
      setLoading(true)
      setMessage(null)

      try {
        const response = await fetchJson<DocRevisionDetail>(`/api/docs/${docRef}/revisions/${revisionId}`)

        if (!cancelled) {
          setDetail(response)
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "历史版本详情读取失败")
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadDetail()

    return () => {
      cancelled = true
    }
  }, [docRef, revisionId])

  const base = `/projects/${projectId}/docs/${docRef}`
  const bodyText = useMemo(() => {
    if (!detail) {
      return ""
    }

    return clean ? detail.cleanText ?? detail.plainText ?? "" : detail.plainText ?? detail.cleanText ?? ""
  }, [clean, detail])

  return (
    <div className="flex flex-col gap-4">
      {message && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{message}</div>}

      {loading ? (
        <Card className="px-4 py-10 text-center text-sm text-muted-foreground">正在加载历史版本详情...</Card>
      ) : detail ? (
        <>
          <PageHeader
            breadcrumb={[detail.project.title, docTypeLabel(detail.doc.docType), "历史版本", `R${detail.revisionNo}`]}
            title={`R${detail.revisionNo} · ${detail.doc.title}`}
            description="历史版本只读，用于回溯、对比与审计"
            actions={
              <div className="flex gap-2">
                <Button variant="outline" className="bg-transparent" onClick={() => setClean((value) => !value)}>
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

          <Card className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-6">
            <Field label="版本号">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold text-foreground">R{detail.revisionNo}</span>
                {detail.isFinal && <StatusBadge label="阶段有效内容" tone="success" />}
              </div>
            </Field>
            <Field label="动作类型">
              <StatusBadge label={revisionActionLabel(detail.action)} tone={revisionActionTone(detail.action)} />
            </Field>
            <Field label="操作人">
              <span className="text-sm text-foreground">
                {detail.actorName}（{ROLE_LABELS[detail.actorRole]}）
              </span>
            </Field>
            <Field label="操作时间">
              <span className="text-sm text-foreground">{detail.createdAt}</span>
            </Field>
            <Field label="基于版本">
              <span className="text-sm text-foreground">{detail.baseRevisionNo ? `R${detail.baseRevisionNo}` : "—"}</span>
            </Field>
            <Field label="内容哈希">
              <span className="font-mono text-xs text-muted-foreground">{detail.contentHash ?? "—"}</span>
            </Field>
          </Card>

          <Card className="p-4">
            <p className="mb-1 text-xs font-medium text-muted-foreground">提交 / 审核说明</p>
            <p className="text-sm text-foreground/90">{detail.handoffNote ?? "该次交接未填写说明。"}</p>
          </Card>

          <Card className="p-6">
            {clean && <p className="mb-4 text-xs text-muted-foreground">当前为 Clean 阅读模式，正文已隐藏协作标记。</p>}
            <article className="mx-auto flex max-w-3xl flex-col gap-5">
              {bodyText
                .split(/\n{2,}/)
                .map((paragraph) => paragraph.trim())
                .filter(Boolean)
                .map((paragraph, index) => (
                  <p key={`${index}-${paragraph.slice(0, 12)}`} className="text-[15px] leading-loose text-foreground/90">
                    {paragraph}
                  </p>
                ))}
              {!bodyText.trim() && <p className="text-sm text-muted-foreground">该版本没有可展示的正文内容。</p>}
            </article>
          </Card>
        </>
      ) : (
        <Card className="px-4 py-10 text-center text-sm text-muted-foreground">Revision 不存在，或你无权访问当前版本。</Card>
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
