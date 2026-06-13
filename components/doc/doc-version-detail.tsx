"use client"

import type { Editor } from "@tiptap/core"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/page-header"
import { fetchJson } from "@/lib/api"
import type { DocRevisionDetail } from "@/types/doc"
import { DiscussionSidebar } from "@/components/doc/tiptap/discussion-sidebar"
import { NovelTiptapEditor } from "@/components/doc/tiptap/novel-tiptap-editor"
import { isNovelDocV1, type NovelCreatedBy } from "@/lib/novel-doc"
import { docTypeLabel } from "@/components/doc/doc-client-shared"
import { ArrowLeft, BookOpen, PenLine } from "lucide-react"

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
  const [editor, setEditor] = useState<Editor | null>(null)
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
  const contentJson = useMemo(() => {
    if (!detail || !isNovelDocV1(detail.contentJson)) {
      return null
    }

    return detail.contentJson
  }, [detail])
  const revisionActor = useMemo<NovelCreatedBy | null>(() => {
    if (!detail) {
      return null
    }

    // 历史版本只读展示不会产生新标注；这里仍传入版本操作者，满足 Tiptap 扩展的统一初始化参数。
    return {
      userId: detail.actorUserId,
      role: detail.actorRole,
      nameSnapshot: detail.actorName,
    }
  }, [detail])

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

          <Card className="p-4">
            <p className="mb-1 text-xs font-medium text-muted-foreground">提交 / 审核说明</p>
            <p className="text-sm text-foreground/90">{detail.handoffNote ?? "该次交接未填写说明。"}</p>
          </Card>

          {clean || !contentJson || !revisionActor ? (
            <Card className="p-6">
              {clean && <p className="mb-4 text-xs text-muted-foreground">当前为 Clean 阅读模式，正文已隐藏批注修订标记。</p>}
              {!contentJson && <p className="mb-4 text-xs text-muted-foreground">当前历史版本缺少可还原的编辑器结构，已切换为文本预览。</p>}
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
          ) : (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
              <NovelTiptapEditor
                value={contentJson}
                editable={false}
                trackChanges={false}
                createdBy={revisionActor}
                saveState="readonly"
                readonlyLabel="历史版本只读"
                onChange={() => undefined}
                onReady={setEditor}
              />

              <aside className="grid content-start gap-4">
                <DiscussionSidebar editor={editor} />
              </aside>
            </div>
          )}
        </>
      ) : (
        <Card className="px-4 py-10 text-center text-sm text-muted-foreground">Revision 不存在，或你无权访问当前版本。</Card>
      )}
    </div>
  )
}
