"use client"

import type { Editor } from "@tiptap/core"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useDebouncedCallback } from "use-debounce"

import { DiscussionSidebar } from "@/components/doc/tiptap/discussion-sidebar"
import { NovelTiptapEditor, type SaveState } from "@/components/doc/tiptap/novel-tiptap-editor"
import { useRole } from "@/components/role-provider"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { PageHeader } from "@/components/page-header"
import { ApiRequestError, fetchJson } from "@/lib/api"
import {
  deriveNovelDocProjection,
  isNovelDocV1,
  stampNovelDocUpdatedAt,
  type NovelCreatedBy,
  type NovelDocJson,
  type NovelDocProjection,
} from "@/lib/novel-doc"
import type { DocCurrentView } from "@/types/doc"
import { BookOpen, CheckCircle2, History, Info, PanelRightOpen, RotateCcw, Send, Undo2 } from "lucide-react"
import { docTypeLabel, snapshotText } from "@/components/doc/doc-client-shared"

type Message = {
  type: "error" | "success" | "warning"
  text: string
}

type DraftPayload = {
  contentJson: NovelDocJson
}

type WorkflowDialogAction = "submit" | "return" | "approve" | "cancelApproval"

function contentSignature(value: NovelDocJson) {
  // 自动保存用字符串签名判断“保存的是不是当前最新稿”，避免旧请求回包覆盖新编辑状态。
  return JSON.stringify(value)
}

function messageClass(type: Message["type"]) {
  if (type === "success") return "rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
  if (type === "warning") return "rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
  return "rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600"
}

function currentUserToNovelActor(user: ReturnType<typeof useRole>["user"]): NovelCreatedBy {
  return {
    userId: user.id,
    role: user.role,
    nameSnapshot: user.name || user.username,
  }
}

export function DocEditor({ projectId, docRef }: { projectId: string; docRef: string }) {
  const router = useRouter()
  const { user } = useRole()
  const createdBy = useMemo(() => currentUserToNovelActor(user), [user])
  const [view, setView] = useState<DocCurrentView | null>(null)
  const [content, setContent] = useState<NovelDocJson | null>(null)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [loading, setLoading] = useState(true)
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [workflowAction, setWorkflowAction] = useState<WorkflowDialogAction | null>(null)
  const [workflowDialogAction, setWorkflowDialogAction] = useState<WorkflowDialogAction | null>(null)
  const [workflowNote, setWorkflowNote] = useState("")
  const [editingPaused, setEditingPaused] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)
  // 批注栏默认展开；用户隐藏后，编辑器区域会切换为全宽，给正文输入保留更大的工作面积。
  const [discussionSidebarVisible, setDiscussionSidebarVisible] = useState(true)

  const viewRef = useRef<DocCurrentView | null>(null)
  const latestPayloadRef = useRef<DraftPayload | null>(null)
  const dirtyRef = useRef(false)
  const pausedByConflictRef = useRef(false)
  const lockVersionRef = useRef(0)
  const saveFailureCountRef = useRef(0)
  const saveInFlightRef = useRef<Promise<boolean> | null>(null)
  const runLatestSaveRef = useRef<() => Promise<boolean>>(async () => false)

  useEffect(() => {
    viewRef.current = view

    if (view?.source.kind === "draft") {
      lockVersionRef.current = view.source.lockVersion
    }
  }, [view])

  const basePath = `/projects/${projectId}/docs/${docRef}`
  const projectDetailHref = `/projects/${projectId}`
  const canEdit = Boolean(view?.permissions.canEditContent && content && !editingPaused)
  const canUseWorkflow = Boolean(content && view?.source.kind === "draft" && !editingPaused)
  const canUseCancelApproval = Boolean(
    view?.permissions.canCancelApproval && view.source.kind === "final_revision" && !editingPaused,
  )
  const trackChanges = Boolean(canEdit && view?.source.kind === "draft" && view.source.ownerRole === "editor")
  const unsupportedLegacyDoc = Boolean(view && !content)

  const debouncedSave = useDebouncedCallback(() => {
    void runLatestSaveRef.current()
  }, 900)

  const runLatestSave = useCallback(async () => {
    const currentView = viewRef.current
    const payload = latestPayloadRef.current

    if (!currentView || currentView.source.kind !== "draft" || !currentView.permissions.canSave || !payload || pausedByConflictRef.current) {
      return false
    }

    if (saveInFlightRef.current) {
      return saveInFlightRef.current
    }

    const savingSignature = contentSignature(payload.contentJson)
    const stampedContent = stampNovelDocUpdatedAt(payload.contentJson)
    const stampedProjection = deriveNovelDocProjection(stampedContent)

    setSaveState("saving")

    const savePromise = (async () => {
      try {
        const response = await fetchJson<DocCurrentView>(`/api/docs/${docRef}/save`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            lockVersion: lockVersionRef.current,
            contentSchemaVersion: 1,
            contentJson: stampedProjection.contentJson,
            wordCount: stampedProjection.wordCount,
            plainText: stampedProjection.plainText,
            cleanText: stampedProjection.cleanText,
            exportText: stampedProjection.exportText,
            summary: stampedProjection.summary,
            commentCount: stampedProjection.commentCount,
            suggestionCount: stampedProjection.suggestionCount,
            revisionMarkCount: stampedProjection.revisionMarkCount,
          }),
        })

        setView(response)

        if (response.source.kind === "draft") {
          lockVersionRef.current = response.source.lockVersion
        }

        if (latestPayloadRef.current && contentSignature(latestPayloadRef.current.contentJson) === savingSignature) {
          dirtyRef.current = false
          saveFailureCountRef.current = 0
          setSaveState("saved")
        } else {
          dirtyRef.current = true
          setSaveState("dirty")
        }

        return true
      } catch (error) {
        if (error instanceof ApiRequestError && error.code === "DOC_LOCK_VERSION_CONFLICT") {
          pausedByConflictRef.current = true
          setEditingPaused(true)
          setSaveState("conflict")
          setMessage({
            type: "error",
            text: "稿件已在其他窗口更新，自动保存已暂停，编辑器已切换为只读。请刷新页面后继续编辑。",
          })
          return false
        }

        saveFailureCountRef.current += 1
        setSaveState("error")
        setMessage({
          type: "error",
          text:
            saveFailureCountRef.current >= 3
              ? "自动保存连续失败，已暂停自动重试。请检查网络后手动触发保存或刷新页面。"
              : error instanceof Error
                ? error.message
                : "自动保存失败",
        })
        return false
      } finally {
        saveInFlightRef.current = null

        // 保存过程中如果用户又继续输入，当前请求结束后重新排队，保证最终落库的是最新内容。
        if (dirtyRef.current && !pausedByConflictRef.current && saveFailureCountRef.current < 3) {
          debouncedSave()
        }
      }
    })()

    saveInFlightRef.current = savePromise
    return savePromise
  }, [debouncedSave, docRef])

  useEffect(() => {
    runLatestSaveRef.current = runLatestSave
  }, [runLatestSave])

  const applyLoadedView = useCallback((response: DocCurrentView, successText?: string) => {
    const sourceContent = response.source.contentJson

    setView(response)
    setWorkflowNote("")
    setWorkflowDialogAction(null)
    dirtyRef.current = false
    pausedByConflictRef.current = false
    saveFailureCountRef.current = 0
    setEditingPaused(false)

    if (response.source.kind === "draft") {
      lockVersionRef.current = response.source.lockVersion
    }

    if (isNovelDocV1(sourceContent)) {
      const nextProjection = deriveNovelDocProjection(sourceContent)

      setContent(nextProjection.contentJson)
      latestPayloadRef.current = {
        contentJson: nextProjection.contentJson,
      }
      setSaveState(response.permissions.canEditContent ? "saved" : "readonly")
    } else {
      setContent(null)
      latestPayloadRef.current = null
      setSaveState("readonly")
    }

    if (successText) {
      setMessage({ type: "success", text: successText })
    }
  }, [])

  const loadDoc = useCallback(async (successText?: string) => {
    setLoading(true)
    setMessage(null)
    debouncedSave.cancel()

    try {
      const response = await fetchJson<DocCurrentView>(`/api/docs/${docRef}/current`)

      applyLoadedView(response, successText)
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Doc 读取失败",
      })
      setView(null)
      setContent(null)
    } finally {
      setLoading(false)
    }
  }, [applyLoadedView, debouncedSave, docRef])

  useEffect(() => {
    void loadDoc()

    return () => {
      debouncedSave.cancel()
    }
  }, [debouncedSave, loadDoc])

  useEffect(() => {
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current) {
        return
      }

      // 浏览器只会展示统一文案；这里设置 returnValue 是为了触发离开确认。
      event.preventDefault()
      event.returnValue = ""
    }

    window.addEventListener("beforeunload", warnBeforeUnload)

    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload)
    }
  }, [])

  function handleEditorChange(json: NovelDocJson, _nextProjection: NovelDocProjection) {
    if (!viewRef.current?.permissions.canSave || pausedByConflictRef.current) {
      return
    }

    setContent(json)
    latestPayloadRef.current = {
      contentJson: json,
    }
    dirtyRef.current = true
    setSaveState("dirty")
    setMessage(null)
    debouncedSave()
  }

  async function flushAutoSave() {
    debouncedSave.cancel()

    if (saveInFlightRef.current) {
      await saveInFlightRef.current
      debouncedSave.cancel()
    }

    if (!dirtyRef.current) {
      return !pausedByConflictRef.current
    }

    return runLatestSave()
  }

  function openWorkflowDialog(action: WorkflowDialogAction) {
    // 流程说明不再常驻在页面右栏，避免正文编辑或最终版查看时被表单干扰。
    // 用户真正触发流程动作后才打开弹窗收集说明，和当前工作流语义保持一致。
    setWorkflowNote("")
    setWorkflowDialogAction(action)
    setMessage(null)
  }

  async function handleWorkflow(action: WorkflowDialogAction, note = "") {
    const currentView = viewRef.current

    if (!currentView) {
      return
    }

    const isCancelApproval = action === "cancelApproval"
    const normalizedNote = note.trim()

    if (isCancelApproval) {
      if (currentView.source.kind !== "final_revision" || !currentView.permissions.canCancelApproval) {
        return
      }
    } else if (currentView.source.kind !== "draft" || !canUseWorkflow) {
      return
    }

    if ((action === "return" || isCancelApproval) && !normalizedNote) {
      setMessage({ type: "error", text: isCancelApproval ? "取消定稿说明不能为空" : "退回说明不能为空" })
      return
    }

    setWorkflowAction(action)
    setMessage(null)

    try {
      const flushed = isCancelApproval ? true : await flushAutoSave()

      if (!flushed) {
        return
      }

      const endpoint = action === "submit" ? "submit" : action === "return" ? "return" : action === "approve" ? "approve" : "cancel-approval"
      const body =
        action === "submit"
          ? {
              lockVersion: lockVersionRef.current,
              submitNote: normalizedNote || null,
            }
          : action === "return"
            ? {
                lockVersion: lockVersionRef.current,
                returnNote: normalizedNote,
              }
            : action === "approve"
              ? {
                  lockVersion: lockVersionRef.current,
                  approveNote: normalizedNote || null,
                }
              : {
                  cancelNote: normalizedNote,
                }

      const response = await fetchJson<DocCurrentView>(`/api/docs/${docRef}/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })

      if (action === "return" || action === "approve" || action === "cancelApproval") {
        // 编辑完成审稿动作或取消定稿后回到项目详情，方便继续查看其它 Doc 状态。
        setWorkflowDialogAction(null)
        setWorkflowNote("")
        router.push(projectDetailHref)
        return
      }

      applyLoadedView(
        response,
        action === "submit" ? "稿件已提交审核" : action === "return" ? "稿件已退回作者" : "稿件已审核通过",
      )
      setWorkflowDialogAction(null)
      setWorkflowNote("")
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "流程操作失败",
      })
    } finally {
      setWorkflowAction(null)
    }
  }

  return (
    // 文稿编辑页直接占满后台主内容区剩余高度；正文滚动交给编辑器内部处理，避免外层页面继续向下延伸。
    <div className="flex h-[calc(100dvh-7rem)] min-h-0 flex-col gap-4 overflow-hidden">
      {message && <div className={`${messageClass(message.type)} shrink-0`}>{message.text}</div>}

      {loading ? (
        <Card className="px-4 py-10 text-center text-sm text-muted-foreground">正在加载稿件...</Card>
      ) : view ? (
        <>
          <div className="shrink-0">
            <PageHeader
              breadcrumb={[
                { label: view.project.title, href: projectDetailHref },
                { label: docTypeLabel(view.doc.docType), href: projectDetailHref },
                "当前稿件",
              ]}
              title={view.doc.title}
              description={trackChanges ? "当前由编辑持有，正文输入会自动写入修订标记。" : undefined}
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
                  {view.permissions.canSubmit && (
                    <Button disabled={workflowAction !== null || !canUseWorkflow} onClick={() => openWorkflowDialog("submit")}>
                      <Send className="mr-1.5 size-4" />
                      {workflowAction === "submit" ? "提交中..." : "提交审核"}
                    </Button>
                  )}
                  {view.permissions.canReturn && (
                    <Button
                      variant="outline"
                      className="bg-transparent"
                      disabled={workflowAction !== null || !canUseWorkflow}
                      onClick={() => openWorkflowDialog("return")}
                    >
                      <RotateCcw className="mr-1.5 size-4" />
                      {workflowAction === "return" ? "退回中..." : "退回作者"}
                    </Button>
                  )}
                  {view.permissions.canApprove && (
                    <Button
                      className="bg-emerald-600 text-white hover:bg-emerald-700"
                      disabled={workflowAction !== null || !canUseWorkflow}
                      onClick={() => openWorkflowDialog("approve")}
                    >
                      <CheckCircle2 className="mr-1.5 size-4" />
                      {workflowAction === "approve" ? "通过中..." : "审稿通过"}
                    </Button>
                  )}
                  {view.permissions.canCancelApproval && (
                    <Button
                      variant="outline"
                      className="border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 hover:text-amber-900"
                      disabled={workflowAction !== null || !canUseCancelApproval}
                      onClick={() => openWorkflowDialog("cancelApproval")}
                    >
                      <Undo2 className="mr-1.5 size-4" />
                      {workflowAction === "cancelApproval" ? "取消中..." : "取消定稿"}
                    </Button>
                  )}
                </div>
              }
            />
          </div>

          {unsupportedLegacyDoc && (
            <Card className="shrink-0 flex-row items-start gap-3 border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <Info className="mt-0.5 size-4 shrink-0" />
              <div className="space-y-2">
                <p>当前稿件不是 Novel Editor Tiptap JSON v1，已按计划进入只读模式，不会静默迁移或自动保存。</p>
                <p className="text-amber-900/80">
                  旧稿预览：{snapshotText(view.source).slice(0, 160) || "暂无可展示正文。"}
                </p>
              </div>
            </Card>
          )}

          {content ? (
            <div
              className={
                discussionSidebarVisible
                  ? "grid min-h-0 flex-1 gap-4 overflow-hidden xl:grid-cols-[minmax(0,1fr)_340px]"
                  : "grid min-h-0 flex-1 gap-4 overflow-hidden"
              }
            >
              <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
                {!discussionSidebarVisible && (
                  <div className="mb-3 flex shrink-0 justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="bg-transparent"
                      onClick={() => setDiscussionSidebarVisible(true)}
                    >
                      <PanelRightOpen className="mr-1.5 size-4" />
                      显示批注
                    </Button>
                  </div>
                )}

                <NovelTiptapEditor
                  value={content}
                  editable={canEdit}
                  trackChanges={trackChanges}
                  createdBy={createdBy}
                  saveState={canEdit ? saveState : "readonly"}
                  onChange={handleEditorChange}
                  onReady={setEditor}
                  className="min-h-0 flex-1"
                />
              </div>

              {discussionSidebarVisible && (
                <aside className="min-h-0 overflow-hidden">
                  <DiscussionSidebar editor={editor} onHide={() => setDiscussionSidebarVisible(false)} className="h-full min-h-0" />
                </aside>
              )}
            </div>
          ) : (
            <Card className="px-4 py-10 text-center text-sm text-muted-foreground">旧格式稿件不能在当前编辑器中修改。</Card>
          )}
        </>
      ) : (
        <Card className="px-4 py-10 text-center text-sm text-muted-foreground">稿件不存在，或你无权访问当前 Doc。</Card>
      )}

      <WorkflowNoteDialog
        action={workflowDialogAction}
        note={workflowNote}
        busy={workflowAction !== null}
        onNoteChange={setWorkflowNote}
        onOpenChange={(open) => {
          if (open || workflowAction !== null) {
            return
          }

          setWorkflowDialogAction(null)
          setWorkflowNote("")
        }}
        onConfirm={() => {
          if (workflowDialogAction) {
            void handleWorkflow(workflowDialogAction, workflowNote)
          }
        }}
      />
    </div>
  )
}

function WorkflowNoteDialog({
  action,
  note,
  busy,
  onNoteChange,
  onOpenChange,
  onConfirm,
}: {
  action: WorkflowDialogAction | null
  note: string
  busy: boolean
  onNoteChange: (value: string) => void
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  const isReturn = action === "return"
  const isApprove = action === "approve"
  const isCancelApproval = action === "cancelApproval"
  const title = isReturn ? "退回作者" : isApprove ? "审稿通过" : isCancelApproval ? "取消定稿" : "提交审核"
  const description = isReturn
    ? "请填写退回原因，作者会在流程记录中看到这段内容。"
    : isApprove
      ? "可填写本次审稿备注，作者会在通知与流程记录中看到这段内容。"
      : isCancelApproval
        ? "请填写取消定稿原因，作者会在待办、通知与流程记录中看到这段内容。"
        : "可补充本次提交说明，便于编辑快速了解修改重点。"
  const placeholder = isReturn
    ? "请输入退回原因，必填"
    : isApprove
      ? "请输入审稿备注，可选"
      : isCancelApproval
        ? "请输入取消定稿原因，必填"
        : "请输入提交说明，可选"
  const busyText = isReturn ? "退回中..." : isApprove ? "通过中..." : isCancelApproval ? "取消中..." : "提交中..."
  const confirmText = isReturn ? "退回作者" : isApprove ? "审稿通过" : isCancelApproval ? "取消定稿" : "确认提交"

  return (
    <Dialog open={Boolean(action)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <Textarea
          rows={7}
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
          disabled={busy}
          placeholder={placeholder}
        />

        <DialogFooter>
          <Button type="button" variant="outline" className="bg-transparent" disabled={busy} onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" disabled={busy || ((isReturn || isCancelApproval) && !note.trim())} onClick={onConfirm}>
            {busy ? busyText : confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
