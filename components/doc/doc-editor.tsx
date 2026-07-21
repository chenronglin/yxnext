"use client"

import type { Editor } from "@tiptap/core"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useDebouncedCallback } from "use-debounce"

import { ChapterDirectory, ChapterNavigationActions } from "@/components/doc/chapter-navigator"
import { DiscussionSidebar } from "@/components/doc/tiptap/discussion-sidebar"
import { NovelTiptapEditor, type SaveState } from "@/components/doc/tiptap/novel-tiptap-editor"
import { useRole } from "@/components/role-provider"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { PageHeader } from "@/components/page-header"
import { ApiRequestError, fetchJson } from "@/lib/api"
import { buildChapterNavigation } from "@/lib/chapter-order"
import {
  deriveNovelDocProjection,
  isNovelDocV1,
  stampNovelDocUpdatedAt,
  type NovelCreatedBy,
  type NovelDocJson,
} from "@/lib/novel-doc"
import { cn } from "@/lib/utils"
import type { DocCurrentView } from "@/types/doc"
import type { ProjectChapterLocator, ProjectDocDirectory } from "@/types/project"
import { BookOpen, CheckCircle2, History, Info, PanelRightOpen, RotateCcw, Send, Undo2 } from "lucide-react"
import { docTypeLabel, snapshotText } from "@/components/doc/doc-client-shared"

type Message = {
  type: "error" | "success" | "warning"
  text: string
  // 连续审稿成功后可附带下一章 ID；提示条只保存稳定 ID，展示时再从最新目录派生章节对象。
  nextChapterDocId?: string
}

type DraftPayload = {
  contentJson: NovelDocJson
}

type WorkflowDialogAction = "submit" | "return" | "approve" | "cancelApproval"

type ProjectDocDirectoryResponse = {
  projectId: string
  title: string
  docDirectory: ProjectDocDirectory
}

// 目录偏好只保存一个布尔值，并使用版本化 key；以后调整默认行为时不会误读旧结构。
const CHAPTER_DIRECTORY_OPEN_STORAGE_KEY = "doc-chapter-directory-open:v1"

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
  const [chapterDirectory, setChapterDirectory] = useState<ProjectChapterLocator[]>([])
  const [chapterDirectoryOpen, setChapterDirectoryOpen] = useState(false)
  const [switchingChapterDocId, setSwitchingChapterDocId] = useState<string | null>(null)
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
  const loadRequestIdRef = useRef(0)
  const switchingChapterDocIdRef = useRef<string | null>(null)

  useEffect(() => {
    try {
      const savedPreference = localStorage.getItem(CHAPTER_DIRECTORY_OPEN_STORAGE_KEY)

      if (savedPreference === "true" || savedPreference === "false") {
        setChapterDirectoryOpen(savedPreference === "true")
        return
      }

      // 没有历史偏好时只在超宽屏默认固定展开；普通桌面使用覆盖式目录，默认收起可以保住正文宽度。
      setChapterDirectoryOpen(window.matchMedia("(min-width: 1536px)").matches)
    } catch {
      // 隐私模式或禁用本地存储时继续使用安全的收起默认值，不让偏好读取阻断正文加载。
      setChapterDirectoryOpen(false)
    }
  }, [])

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
  const chapterNavigation = useMemo(
    () => buildChapterNavigation(chapterDirectory, docRef),
    [chapterDirectory, docRef],
  )
  const showChapterNavigation = view?.doc.docType === "chapter" && chapterNavigation.currentIndex >= 0
  const nextMessageChapter = message?.nextChapterDocId
    ? chapterNavigation.orderedChapters.find((chapter) => chapter.docId === message.nextChapterDocId) ?? null
    : null

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
    const requestId = ++loadRequestIdRef.current

    setLoading(true)
    setMessage(null)
    debouncedSave.cancel()

    try {
      // 当前稿件和项目 Doc 目录互不依赖，必须并行读取；目录接口失败时仍允许正文继续工作。
      const [currentViewResult, directoryResult] = await Promise.allSettled([
        fetchJson<DocCurrentView>(`/api/docs/${docRef}/current`),
        fetchJson<ProjectDocDirectoryResponse>(`/api/projects/${projectId}/docs`),
      ])

      // 快速连续切章时旧请求可能晚于新请求返回；序号门禁确保旧正文绝不会覆盖用户刚进入的新章节。
      if (requestId !== loadRequestIdRef.current) {
        return
      }

      if (currentViewResult.status === "rejected") {
        throw currentViewResult.reason
      }

      const response = currentViewResult.value

      if (directoryResult.status === "fulfilled") {
        setChapterDirectory(directoryResult.value.docDirectory.chapterDocs)
      } else if (response.doc.docType === "chapter") {
        // 目录属于增强导航能力；失败时保留正文并给出可恢复提示，用户仍能正常编辑和走审稿流程。
        setChapterDirectory([])
        setMessage({ type: "warning", text: "稿件已加载，但章节目录读取失败。刷新页面后可重试。" })
      }

      applyLoadedView(response, successText)
    } catch (error) {
      if (requestId !== loadRequestIdRef.current) {
        return
      }

      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Doc 读取失败",
      })
      setView(null)
      setContent(null)
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setLoading(false)
        setSwitchingChapterDocId(null)
        switchingChapterDocIdRef.current = null
      }
    }
  }, [applyLoadedView, debouncedSave, docRef, projectId])

  useEffect(() => {
    void loadDoc()

    return () => {
      // 组件卸载或 docRef 改变时立即让在途响应失效，同时取消尚未执行的延迟保存任务。
      loadRequestIdRef.current += 1
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

  function handleEditorChange(json: NovelDocJson) {
    if (!viewRef.current?.permissions.canSave || pausedByConflictRef.current) {
      return
    }

    // 编辑会话内由 Tiptap/ProseMirror 独占正文状态；这里不再把每个 transaction 的 JSON
    // 逐字镜像回 React content。否则父组件重渲染后，子组件很容易把旧 value 误判为外部换稿，
    // 进而用整篇 setContent 覆盖当前 selection。自动保存始终读取 latestPayloadRef，因此无需丢失任何修改。
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

  function handleChapterDirectoryOpenChange(open: boolean) {
    setChapterDirectoryOpen(open)

    try {
      // 只保存目录开关这一项非敏感偏好；写入失败不影响当前会话里的展开状态。
      localStorage.setItem(CHAPTER_DIRECTORY_OPEN_STORAGE_KEY, String(open))
    } catch {
      // Safari 隐私模式、存储配额不足等情况可能抛错，目录本身仍可在当前页面正常使用。
    }
  }

  async function handleChapterNavigate(chapter: ProjectChapterLocator) {
    if (chapter.docId === docRef || switchingChapterDocIdRef.current !== null) {
      return
    }

    // ref 在同一个事件循环内立即生效，可拦住双击或自动化工具重试造成的连续跨两章；state 只负责渲染加载态。
    switchingChapterDocIdRef.current = chapter.docId
    setSwitchingChapterDocId(chapter.docId)
    setMessage(null)

    // 客户端路由切换不会触发 beforeunload；必须在 push 前主动清空延迟保存队列并等待最新内容落库。
    const flushed = await flushAutoSave()

    if (!flushed) {
      switchingChapterDocIdRef.current = null
      setSwitchingChapterDocId(null)
      return
    }

    router.push(`/projects/${projectId}/docs/${chapter.docId}`)
  }

  function syncChapterDirectoryFromView(response: DocCurrentView) {
    if (response.doc.docType !== "chapter") {
      return
    }

    // 审稿动作成功后直接同步当前目录项，避免为了一个状态变化重新读取整个目录；下次切章仍会向服务端校准。
    setChapterDirectory((current) =>
      current.map((chapter) =>
        chapter.docId === response.doc.docId
          ? {
              ...chapter,
              title: response.doc.title,
              chapterNo: response.doc.chapterNo,
              sortOrder: response.doc.sortOrder,
              status: response.doc.status,
              holderRole: response.doc.holderRole,
              approved: response.doc.status === "approved",
            }
          : chapter,
      ),
    )
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

      const successText =
        action === "submit"
          ? "稿件已提交审核"
          : action === "return"
            ? "稿件已退回作者"
            : action === "approve"
              ? "稿件已审核通过"
              : "已取消定稿"

      syncChapterDirectoryFromView(response)

      if (response.doc.docType === "chapter") {
        // 正文章节完成流程动作后继续留在审阅工作区；编辑可直接使用顶部按钮或成功提示进入下一章。
        applyLoadedView(response)
        setMessage({
          type: "success",
          text: successText,
          nextChapterDocId:
            action === "return" || action === "approve" ? chapterNavigation.nextChapter?.docId : undefined,
        })
        setWorkflowDialogAction(null)
        setWorkflowNote("")
        return
      }

      if (action === "return" || action === "approve" || action === "cancelApproval") {
        // 非正文章节没有连续审阅语义，继续沿用原流程回到项目详情查看其它阶段 Doc。
        setWorkflowDialogAction(null)
        setWorkflowNote("")
        router.push(projectDetailHref)
        return
      }

      applyLoadedView(response, successText)
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
      {message && (
        <div className={cn(messageClass(message.type), "flex shrink-0 items-center justify-between gap-3")}>
          <span>{message.text}</span>
          {message.type === "success" && nextMessageChapter && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 border-emerald-300 bg-white/70 text-emerald-800 hover:bg-white"
              disabled={switchingChapterDocId !== null}
              onClick={() => void handleChapterNavigate(nextMessageChapter)}
            >
              继续审阅下一章
            </Button>
          )}
        </div>
      )}

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
                  {showChapterNavigation && (
                    <ChapterNavigationActions
                      currentIndex={chapterNavigation.currentIndex}
                      totalChapters={chapterNavigation.orderedChapters.length}
                      previousChapter={chapterNavigation.previousChapter}
                      nextChapter={chapterNavigation.nextChapter}
                      directoryOpen={chapterDirectoryOpen}
                      switchingDocId={switchingChapterDocId}
                      onDirectoryOpenChange={handleChapterDirectoryOpenChange}
                      onNavigate={(chapter) => void handleChapterNavigate(chapter)}
                    />
                  )}
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
            <>
              <div className="relative flex min-h-0 flex-1 gap-4 overflow-hidden">
                {showChapterNavigation && chapterDirectoryOpen && (
                  <button
                    type="button"
                    className="absolute inset-0 z-20 bg-foreground/10 backdrop-blur-[1px] 2xl:hidden"
                    aria-label="关闭章节目录"
                    onClick={() => handleChapterDirectoryOpenChange(false)}
                  />
                )}

                {showChapterNavigation && (
                  <ChapterDirectory
                    chapters={chapterNavigation.orderedChapters}
                    currentDocId={docRef}
                    currentIndex={chapterNavigation.currentIndex}
                    open={chapterDirectoryOpen}
                    switchingDocId={switchingChapterDocId}
                    onOpenChange={handleChapterDirectoryOpenChange}
                    onNavigate={(chapter) => void handleChapterNavigate(chapter)}
                  />
                )}

                <div
                  className={cn(
                    "grid min-h-0 min-w-0 flex-1 gap-4 overflow-hidden",
                    discussionSidebarVisible && "xl:grid-cols-[minmax(0,1fr)_340px]",
                  )}
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
                      // 同一路由模板切换 docRef 时强制重建 Tiptap，彻底清除上一章的选区、滚动和组合输入状态。
                      key={docRef}
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
                      <DiscussionSidebar
                        editor={editor}
                        onHide={() => setDiscussionSidebarVisible(false)}
                        className="h-full min-h-0"
                      />
                    </aside>
                  )}
                </div>
              </div>
            </>
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
