"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"

import { PageHeader } from "@/components/page-header"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { StatusBadge } from "@/components/status-badge"
import { fetchJson } from "@/lib/api"
import { HOLDER_ROLE_LABELS, DOC_STATUS_LABELS, STAGE_PLAN_STATUS_LABELS } from "@/types/domain"
import type { DocCurrentView } from "@/types/doc"
import { countChineseStyleWords, docStatusTone, docTypeLabel, holderTone, textToDocJson } from "@/components/doc/doc-client-shared"
import { BookOpen, History, Info, Save, Send, CheckCircle2, RotateCcw } from "lucide-react"

export function DocEditor({ projectId, docRef }: { projectId: string; docRef: string }) {
  const [view, setView] = useState<DocCurrentView | null>(null)
  const [text, setText] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState<null | "submit" | "return" | "approve">(null)
  const [handoffNote, setHandoffNote] = useState("")
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null)

  const basePath = `/projects/${projectId}/docs/${docRef}`
  const canEdit = view?.permissions.canEditContent ?? false
  const hasLightweightEditorRisk = Boolean(
    view &&
      view.source.kind === "draft" &&
      (view.source.commentCount > 0 || view.source.suggestionCount > 0 || view.source.revisionMarkCount > 0),
  )

  async function loadDoc(successText?: string) {
    setLoading(true)

    try {
      const response = await fetchJson<DocCurrentView>(`/api/docs/${docRef}/current`)
      setView(response)
      setText(response.source.plainText ?? response.source.cleanText ?? response.source.exportText ?? "")
      setHandoffNote("")

      if (successText) {
        setMessage({
          type: "success",
          text: successText,
        })
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Doc 读取失败",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadDoc()
  }, [docRef])

  const summaryText = useMemo(() => {
    if (!view) {
      return ""
    }

    return view.doc.summary ?? text.slice(0, 120)
  }, [text, view])

  async function handleSave() {
    if (!view || view.source.kind !== "draft") {
      return
    }

    setSaving(true)
    setMessage(null)

    try {
      const response = await fetchJson<DocCurrentView>(`/api/docs/${docRef}/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lockVersion: view.source.lockVersion,
          contentJson: textToDocJson(text),
          wordCount: countChineseStyleWords(text),
          plainText: text,
          // 轻量文本版编辑器当前不保留复杂协作标记，因此这里把 clean/export 同步为正文文本；
          // 一旦后续富文本版接回批注/建议/修订标记，这三个派生字段仍可沿用同一接口继续提交。
          cleanText: text,
          exportText: text,
          summary: summaryText,
          commentCount: 0,
          suggestionCount: 0,
          revisionMarkCount: 0,
        }),
      })

      setView(response)
      setText(response.source.plainText ?? response.source.cleanText ?? response.source.exportText ?? "")
      setMessage({
        type: "success",
        text: "草稿已保存",
      })
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "草稿保存失败",
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleWorkflow(action: "submit" | "return" | "approve") {
    if (!view || view.source.kind !== "draft") {
      return
    }

    setSubmitting(action)
    setMessage(null)

    try {
      const endpoint =
        action === "submit" ? "submit" : action === "return" ? "return" : "approve"
      const body =
        action === "submit"
          ? {
              lockVersion: view.source.lockVersion,
              submitNote: handoffNote.trim() || null,
            }
          : action === "return"
            ? {
                lockVersion: view.source.lockVersion,
                returnNote: handoffNote.trim(),
              }
            : {
                lockVersion: view.source.lockVersion,
                approveNote: handoffNote.trim() || null,
              }

      const response = await fetchJson<DocCurrentView>(`/api/docs/${docRef}/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })

      setView(response)
      setText(response.source.plainText ?? response.source.cleanText ?? response.source.exportText ?? "")
      setHandoffNote("")
      setMessage({
        type: "success",
        text: action === "submit" ? "稿件已提交审核" : action === "return" ? "稿件已退回作者" : "稿件已审核通过",
      })
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "流程操作失败",
      })
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
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

      {loading ? (
        <Card className="px-4 py-10 text-center text-sm text-muted-foreground">正在加载稿件...</Card>
      ) : view ? (
        <>
          <PageHeader
            breadcrumb={[view.project.title, docTypeLabel(view.doc.docType), "当前稿件"]}
            title={view.doc.title}
            description="当前页面已接通真实 Doc API，保存/提交/退回/通过都会直接写入数据库并触发通知/待办流转"
            actions={
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" className="bg-transparent">
                  <Link href={`${basePath}/versions`}>
                    <History className="mr-1.5 size-4" />
                    历史版本
                  </Link>
                </Button>
                <Button asChild variant="outline" className="bg-transparent">
                  <Link href={`${basePath}/clean`}>
                    <BookOpen className="mr-1.5 size-4" />
                    Clean 阅读
                  </Link>
                </Button>
              </div>
            }
          />

          <Card className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-6">
            <MetaField label="Doc 类型">
              <StatusBadge label={docTypeLabel(view.doc.docType)} tone="neutral" />
            </MetaField>
            <MetaField label="当前状态">
              <StatusBadge label={DOC_STATUS_LABELS[view.doc.status]} tone={docStatusTone(view.doc.status)} />
            </MetaField>
            <MetaField label="当前持有人">
              <StatusBadge label={HOLDER_ROLE_LABELS[view.doc.holderRole]} tone={holderTone(view.doc.holderRole)} />
            </MetaField>
            <MetaField label="当前字数">
              <span className="text-sm text-foreground">{countChineseStyleWords(text).toLocaleString()} 字</span>
            </MetaField>
            <MetaField label="阶段计划">
              {view.project.docStagePlan ? (
                <span className="text-sm text-foreground">{STAGE_PLAN_STATUS_LABELS[view.project.docStagePlan.timelineStatus]}</span>
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
            </MetaField>
            <MetaField label="lock_version">
              <span className="font-mono text-sm text-foreground">{view.source.kind === "draft" ? `v${view.source.lockVersion}` : "最终版本"}</span>
            </MetaField>
          </Card>

          {hasLightweightEditorRisk && (
            <Card className="flex items-start gap-3 border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <Info className="mt-0.5 size-4 shrink-0" />
              当前页面已切到真实 API，但正文编辑器仍是轻量文本版；若继续保存，会把批注/建议/修订标记折叠为纯文本内容。
            </Card>
          )}

          <Card className="flex flex-col gap-4 p-4">
            <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
              <div className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold text-foreground">正文内容</h2>
                <Textarea
                  rows={22}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  disabled={!canEdit}
                  className="min-h-[520px] font-mono text-sm leading-7"
                />
              </div>

              <div className="flex flex-col gap-3">
                <Card className="p-4">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">协作状态</p>
                  <p className="text-sm text-foreground">
                    {canEdit ? "你当前持有编辑权，可以继续保存正文。"
                    : "你当前没有编辑权，可查看但不能修改正文。"}
                  </p>
                </Card>

                <Card className="p-4">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">最近交接说明</p>
                  <p className="text-sm leading-6 text-foreground/90">{view.doc.lastHandoffNote ?? "暂无交接说明。"}</p>
                </Card>

                <Card className="p-4">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">提交 / 审核说明</p>
                  <Textarea
                    rows={8}
                    value={handoffNote}
                    onChange={(event) => setHandoffNote(event.target.value)}
                    disabled={!(view.permissions.canSubmit || view.permissions.canReturn || view.permissions.canApprove)}
                    placeholder={view.permissions.canReturn ? "退回时必填；通过时可选填写审核说明" : "可填写提交说明"}
                  />
                </Card>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <Button variant="outline" className="bg-transparent" disabled={!view.permissions.canSave || saving} onClick={() => void handleSave()}>
                <Save className="mr-1.5 size-4" />
                {saving ? "保存中..." : "保存草稿"}
              </Button>

              <Button disabled={!view.permissions.canSubmit || submitting !== null} onClick={() => void handleWorkflow("submit")}>
                <Send className="mr-1.5 size-4" />
                {submitting === "submit" ? "提交中..." : "提交审核"}
              </Button>

              <Button
                variant="outline"
                className="bg-transparent"
                disabled={!view.permissions.canReturn || submitting !== null || !handoffNote.trim()}
                onClick={() => void handleWorkflow("return")}
              >
                <RotateCcw className="mr-1.5 size-4" />
                {submitting === "return" ? "退回中..." : "退回作者"}
              </Button>

              <Button
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={!view.permissions.canApprove || submitting !== null}
                onClick={() => void handleWorkflow("approve")}
              >
                <CheckCircle2 className="mr-1.5 size-4" />
                {submitting === "approve" ? "通过中..." : "审核通过"}
              </Button>
            </div>
          </Card>
        </>
      ) : (
        <Card className="px-4 py-10 text-center text-sm text-muted-foreground">稿件不存在，或你无权访问当前 Doc。</Card>
      )}
    </div>
  )
}

function MetaField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}
