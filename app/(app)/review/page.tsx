"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"

import { PageHeader } from "@/components/page-header"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { StatusBadge } from "@/components/status-badge"
import { useRole } from "@/components/role-provider"
import { fetchJson } from "@/lib/api"
import type { DocCurrentView } from "@/types/doc"
import type { ReviewQueueItem } from "@/types/workbench"
import { DOC_STATUS_LABELS } from "@/types/domain"
import { CheckCircle, ChevronRight, Clock, ExternalLink, FileCheck2, Info, RotateCcw, ThumbsUp, User } from "lucide-react"

type ReviewQueueResponse = {
  items: ReviewQueueItem[]
}

type CurrentDocResponse = DocCurrentView

function docTypeLabel(docType: ReviewQueueItem["docType"]) {
  if (docType === "synopsis") return "梗概"
  if (docType === "outline") return "细纲"
  if (docType === "chapter") return "正文"
  return "质检"
}

export default function ReviewWorkbenchPage() {
  const { role } = useRole()
  const searchParams = useSearchParams()
  const [reviews, setReviews] = useState<ReviewQueueItem[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [currentDoc, setCurrentDoc] = useState<DocCurrentView | null>(null)
  const [feedback, setFeedback] = useState("")
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<null | "approve" | "return">(null)
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null)

  const selectedItem = useMemo(() => reviews.find((item) => item.docId === selectedId) ?? null, [reviews, selectedId])
  const preferredDocId = searchParams.get("docId")
  const isAuthorized = role === "editor" || role === "admin"

  async function loadQueue(successText?: string) {
    setLoading(true)

    try {
      const response = await fetchJson<ReviewQueueResponse>("/api/review")
      setReviews(response.items)

      const nextSelectedId =
        response.items.find((item) => item.docId === selectedId)?.docId ??
        response.items.find((item) => item.docId === preferredDocId)?.docId ??
        response.items[0]?.docId ??
        ""

      setSelectedId(nextSelectedId)

      if (successText) {
        setMessage({
          type: "success",
          text: successText,
        })
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "审稿队列读取失败",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadQueue()
  }, [preferredDocId])

  useEffect(() => {
    if (!selectedId) {
      setCurrentDoc(null)
      return
    }

    let cancelled = false

    async function loadCurrentDoc() {
      try {
        const response = await fetchJson<CurrentDocResponse>(`/api/docs/${selectedId}/current`)

        if (!cancelled) {
          setCurrentDoc(response)
        }
      } catch (error) {
        if (!cancelled) {
          setMessage({
            type: "error",
            text: error instanceof Error ? error.message : "稿件详情读取失败",
          })
          setCurrentDoc(null)
        }
      }
    }

    void loadCurrentDoc()

    return () => {
      cancelled = true
    }
  }, [selectedId])

  async function handleApprove() {
    if (!selectedItem || !currentDoc || currentDoc.source.kind !== "draft") {
      return
    }

    setActionLoading("approve")
    setMessage(null)

    try {
      await fetchJson(`/api/docs/${selectedItem.docId}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lockVersion: currentDoc.source.lockVersion,
          approveNote: feedback.trim() || null,
        }),
      })

      setFeedback("")
      await loadQueue(`【${selectedItem.title}】已审核通过`)
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "审核通过失败",
      })
    } finally {
      setActionLoading(null)
    }
  }

  async function handleReturn() {
    if (!selectedItem || !currentDoc || currentDoc.source.kind !== "draft") {
      return
    }

    if (!feedback.trim()) {
      setMessage({
        type: "error",
        text: "请先填写退回说明",
      })
      return
    }

    setActionLoading("return")
    setMessage(null)

    try {
      await fetchJson(`/api/docs/${selectedItem.docId}/return`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lockVersion: currentDoc.source.lockVersion,
          returnNote: feedback.trim(),
        }),
      })

      setFeedback("")
      await loadQueue(`【${selectedItem.title}】已退回作者修改`)
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "退回失败",
      })
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["审稿工作台"]}
        title="审稿工作台"
        description="聚合编辑辖下所有项目中，作者最新提交审核的梗概、细纲、正文与质检 Doc"
      />

      {message && (
        <div
          className={
            message.type === "error"
              ? "rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600"
              : "rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
          }
        >
          {message.text}
        </div>
      )}

      {!isAuthorized && (
        <div className="flex items-center gap-3.5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <Info className="size-4 shrink-0 text-amber-600" />
          该页面仅供编辑和管理员使用，当前账号没有审稿权限。
        </div>
      )}

      {loading ? (
        <Card className="px-4 py-10 text-center text-sm text-muted-foreground">正在加载待审稿件...</Card>
      ) : reviews.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-4 border-dashed border-2 py-20 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle className="size-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-medium text-foreground">所有待审稿件已处理完毕</h3>
            <p className="text-sm text-muted-foreground">当前没有任何待审核的梗概、细纲、正文或质检 Doc。</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-3 lg:col-span-1">
            <div className="px-1 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              待审稿件 ({reviews.length})
            </div>
            <div className="flex flex-col gap-3">
              {reviews.map((item) => {
                const active = item.docId === selectedId

                return (
                  <Card
                    key={item.docId}
                    className={`cursor-pointer border p-4 transition-all hover:border-primary/50 hover:shadow-xs ${
                      active ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border bg-card"
                    }`}
                    onClick={() => {
                      setSelectedId(item.docId)
                      setFeedback("")
                    }}
                  >
                    <div className="flex flex-col gap-1">
                      <span className="truncate text-xs text-muted-foreground">{item.projectTitle}</span>
                      <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="size-3" />
                        {item.authorName}
                      </span>
                      <span>{item.words} 字</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-border/40 pt-2.5 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" />
                        {item.submittedAt ?? "—"}
                      </span>
                      <ChevronRight className={`size-4 transition-transform ${active ? "translate-x-1 text-primary" : ""}`} />
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>

          {selectedItem && (
            <Card className="flex flex-col gap-5 border border-border bg-card p-5 shadow-sm lg:col-span-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">{selectedItem.projectTitle}</span>
                  <h2 className="text-lg font-bold text-foreground">{selectedItem.title}</h2>
                </div>
                <Button asChild size="sm" variant="outline" className="self-start bg-transparent sm:self-auto">
                  <Link href={`/projects/${selectedItem.projectId}/docs/${selectedItem.docId}`}>
                    <ExternalLink className="mr-1.5 size-3.5" />
                    进入详细审稿流
                  </Link>
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/40 p-3 text-xs sm:grid-cols-4">
                <div>
                  <p className="text-muted-foreground">稿件类型</p>
                  <p className="mt-1 font-semibold text-foreground">{docTypeLabel(selectedItem.docType)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">提交作者</p>
                  <p className="mt-1 font-semibold text-foreground">{selectedItem.authorName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">字数</p>
                  <p className="mt-1 font-semibold text-foreground">{selectedItem.words} 字</p>
                </div>
                <div>
                  <p className="text-muted-foreground">当前状态</p>
                  <p className="mt-1 font-semibold text-foreground">{currentDoc ? DOC_STATUS_LABELS[currentDoc.doc.status] : "加载中"}</p>
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <section className="flex flex-col gap-3">
                  <h3 className="text-sm font-semibold text-foreground">提交说明</h3>
                  <Card className="bg-muted/30 p-4 text-sm text-foreground/90">{selectedItem.submitNote || "作者未填写提交说明。"}</Card>
                  <h3 className="text-sm font-semibold text-foreground">当前稿件预览</h3>
                  <Card className="min-h-40 bg-card p-4 text-sm leading-7 text-foreground/90">{selectedItem.previewText || "暂无正文预览。"}</Card>
                </section>

                <section className="flex flex-col gap-3">
                  <h3 className="text-sm font-semibold text-foreground">上一轮有效内容</h3>
                  <Card className="min-h-40 bg-muted/20 p-4 text-sm leading-7 text-foreground/80">
                    {selectedItem.previousPreviewText || "上一轮历史版本不存在，或当前提交为该 Doc 的第一轮内容。"}
                  </Card>

                  <h3 className="text-sm font-semibold text-foreground">审核反馈</h3>
                  <Textarea
                    rows={6}
                    value={feedback}
                    onChange={(event) => setFeedback(event.target.value)}
                    placeholder="退回时必填；通过时可选填写整体审核说明。"
                    disabled={!currentDoc?.permissions.canApprove && !currentDoc?.permissions.canReturn}
                  />
                </section>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                <Button
                  variant="outline"
                  className="bg-transparent"
                  disabled={!currentDoc?.permissions.canReturn || actionLoading !== null}
                  onClick={() => void handleReturn()}
                >
                  <RotateCcw className="mr-1.5 size-4" />
                  {actionLoading === "return" ? "退回中..." : "退回作者修改"}
                </Button>
                <Button
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  disabled={!currentDoc?.permissions.canApprove || actionLoading !== null}
                  onClick={() => void handleApprove()}
                >
                  <ThumbsUp className="mr-1.5 size-4" />
                  {actionLoading === "approve" ? "通过中..." : "审核通过"}
                </Button>
                <span className="ml-auto text-xs text-muted-foreground">
                  {currentDoc?.source.kind === "draft" ? `lock_version v${currentDoc.source.lockVersion}` : "当前稿件不是可审核草稿"}
                </span>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
