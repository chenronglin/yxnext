"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"

import { PageHeader } from "@/components/page-header"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/status-badge"
import { fetchJson } from "@/lib/api"
import type { DocCurrentView, DocRevisionDetail } from "@/types/doc"
import { docTypeLabel } from "@/components/doc/doc-client-shared"
import { BookOpen, Download, History, PenLine } from "lucide-react"

export function DocCleanView({
  projectId,
  docRef,
  revisionId,
}: {
  projectId: string
  docRef: string
  revisionId?: string
}) {
  const [currentView, setCurrentView] = useState<DocCurrentView | null>(null)
  const [revision, setRevision] = useState<DocRevisionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadCleanSource() {
      setLoading(true)
      setMessage(null)

      try {
        if (revisionId) {
          const response = await fetchJson<DocRevisionDetail>(`/api/docs/${docRef}/revisions/${revisionId}`)

          if (!cancelled) {
            setRevision(response)
            setCurrentView(null)
          }
        } else {
          const response = await fetchJson<DocCurrentView>(`/api/docs/${docRef}/current`)

          if (!cancelled) {
            setCurrentView(response)
            setRevision(null)
          }
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Clean 正文读取失败")
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadCleanSource()

    return () => {
      cancelled = true
    }
  }, [docRef, revisionId])

  const base = `/projects/${projectId}/docs/${docRef}`
  const exportScope =
    (revision?.doc.docType ?? currentView?.doc.docType) === "chapter"
      ? "chapters"
      : (revision?.doc.docType ?? currentView?.doc.docType ?? "project")
  const cleanText = revision?.cleanText ?? currentView?.source.cleanText ?? revision?.plainText ?? currentView?.source.plainText ?? ""
  const title = revision?.doc.title ?? currentView?.doc.title ?? "Clean 阅读"
  const projectTitle = revision?.project.title ?? currentView?.project.title ?? "项目"
  const typeLabel = revision ? docTypeLabel(revision.doc.docType) : currentView ? docTypeLabel(currentView.doc.docType) : "Doc"
  const wordCount = revision?.wordCount ?? currentView?.source.wordCount ?? 0
  const sourceLabel = useMemo(() => {
    if (revision) {
      return revision.isFinal ? `最终 Revision · R${revision.revisionNo}` : `指定 Revision · R${revision.revisionNo}`
    }

    if (!currentView) {
      return "当前稿件"
    }

    return currentView.source.kind === "final_revision" ? `最终 Revision · R${currentView.source.revisionNo}` : "当前工作稿"
  }, [currentView, revision])

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumb={[projectTitle, typeLabel, "阅读模式"]}
        title="阅读模式 · Clean 正文"
        description="去除全部批注修订标记后的正文视角"
        actions={
          <div className="flex flex-wrap gap-2">
            {revisionId ? (
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
            <Button asChild variant="outline" className="bg-transparent">
              <a href={`/api/projects/${projectId}/export?scope=${exportScope}&format=docx`}>
                <Download className="mr-1.5 size-4" />
                导出
              </a>
            </Button>
          </div>
        }
      />

      {message && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{message}</div>}

      {loading ? (
        <Card className="px-4 py-10 text-center text-sm text-muted-foreground">正在加载 Clean 正文...</Card>
      ) : (
        <>
          <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">预览来源</span>
              <StatusBadge label={sourceLabel} tone={revision?.isFinal || currentView?.source.kind === "final_revision" ? "success" : "info"} />
            </div>
            <span className="text-sm text-muted-foreground">
              字数统计 <span className="font-medium text-foreground">{wordCount.toLocaleString()}</span> 字
            </span>
          </Card>

          <Card className="p-6 sm:p-10">
            <article className="mx-auto flex max-w-2xl flex-col gap-5">
              <h2 className="text-xl font-semibold text-foreground">{title}</h2>
              {cleanText
                .split(/\n{2,}/)
                .map((paragraph) => paragraph.trim())
                .filter(Boolean)
                .map((paragraph, index) => (
                  <p key={`${index}-${paragraph.slice(0, 12)}`} className="text-[15px] leading-loose text-foreground/90">
                    {paragraph}
                  </p>
                ))}
              {!cleanText.trim() && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <BookOpen className="size-4" />
                  当前没有可展示的 Clean 正文内容。
                </div>
              )}
            </article>
          </Card>
        </>
      )}
    </div>
  )
}
