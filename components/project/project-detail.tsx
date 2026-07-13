"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

import { PageHeader } from "@/components/page-header"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { StatusBadge } from "@/components/status-badge"
import { StageProgress } from "@/components/project/stage-progress"
import { StagePlanTable } from "@/components/project/stage-plan-table"
import { useRole } from "@/components/role-provider"
import { fetchJson } from "@/lib/api"
import { compareChaptersByChapterNo } from "@/lib/chapter-order"
import { formatDateOnly } from "@/lib/utils"
import { DOC_STATUS_LABEL_KEYS, HOLDER_ROLE_LABEL_KEYS, PROJECT_LIFECYCLE_LABEL_KEYS, PROJECT_STAGE_LABEL_KEYS } from "@/types/domain"
import type { BadgeTone } from "@/types/domain"
import { useT } from "@/hooks/use-t"
import {
  DOC_STATUS_TONE,
  PROJECT_LIFECYCLE_TONE,
  PROJECT_STAGE_TONE,
  type ProjectChapterLocator,
  type ProjectDetail as ProjectDetailView,
} from "@/types/project"
import { Plus, Unlock, CheckCircle2, Download, Lock, FileText, History, BookOpen, ClipboardCheck, Pencil, Trash2 } from "lucide-react"

type ProjectDetailResponse = {
  project: ProjectDetailView
}

// 章节弹窗统一按屏幕二分之一显示，新增和删除保持一致的视觉宽度。
const CHAPTER_DIALOG_WIDTH_CLASS = "w-[50vw] max-w-[50vw] sm:max-w-[50vw]"

export function ProjectDetail({ id }: { id: string }) {
  const t = useT()
  const { role } = useRole()
  const [project, setProject] = useState<ProjectDetailView | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null)
  const [workingAction, setWorkingAction] = useState<null | "unlock" | "complete">(null)
  const [chapterDialogOpen, setChapterDialogOpen] = useState(false)
  const [creatingChapter, setCreatingChapter] = useState(false)
  const [newChapter, setNewChapter] = useState({
    title: "",
    chapterNo: "",
  })
  const [deleteTarget, setDeleteTarget] = useState<ProjectChapterLocator | null>(null)
  const [deletingChapterId, setDeletingChapterId] = useState<string | null>(null)
  const [chapterNumberTarget, setChapterNumberTarget] = useState<ProjectChapterLocator | null>(null)
  const [chapterTitleValue, setChapterTitleValue] = useState("")
  const [chapterNumberValue, setChapterNumberValue] = useState("")
  const [chapterNumberError, setChapterNumberError] = useState<string | null>(null)
  const [updatingChapterNumber, setUpdatingChapterNumber] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadProject() {
      setLoading(true)
      setMessage(null)

      try {
        const response = await fetchJson<ProjectDetailResponse>(`/api/projects/${id}`)

        if (!cancelled) {
          setProject(response.project)
        }
      } catch (error) {
        if (!cancelled) {
          setMessage({
            type: "error",
            text: error instanceof Error ? error.message : "项目详情读取失败",
          })
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadProject()

    return () => {
      cancelled = true
    }
  }, [id])

  const readonly = project
    ? project.lifecycle === "completed" || project.lifecycle === "archived" || project.lifecycle === "cancelled"
    : true
  const canUnlockRelease = Boolean(
    project &&
      project.stage === "chapter" &&
      project.approvedChapters === project.totalChapters &&
      project.totalChapters > 0 &&
      project.releaseDocStatus === "locked",
  )
  const canComplete = Boolean(project && !readonly && project.releaseDocStatus === "approved" && (role === "editor" || role === "admin"))
  // 正文章节的新建和结构调整只由作者发起，编辑进入章节页后只处理稿件协作和审核。
  const canManageChapters = Boolean(project && !readonly && project.stage === "chapter" && role === "author")
  const canExportProject = role === "editor" || role === "admin"
  const canExportRelease = Boolean(canExportProject && project?.docDirectory.releaseDocId)
  const hasActionItems = canUnlockRelease || canComplete || canExportProject || canExportRelease

  async function refreshProject(successText?: string) {
    const response = await fetchJson<ProjectDetailResponse>(`/api/projects/${id}`)
    setProject(response.project)

    if (successText) {
      setMessage({
        type: "success",
        text: successText,
      })
    }
  }

  async function handleUnlockRelease() {
    if (!project) {
      return
    }

    setWorkingAction("unlock")
    setMessage(null)

    try {
      await fetchJson<ProjectDetailResponse>(`/api/projects/${project.id}/qc/unlock`, {
        method: "POST",
      })
      await refreshProject("质检已解锁，项目已进入质检阶段")
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "质检解锁失败",
      })
    } finally {
      setWorkingAction(null)
    }
  }

  async function handleCompleteProject() {
    if (!project) {
      return
    }

    setWorkingAction("complete")
    setMessage(null)

    try {
      await fetchJson<ProjectDetailResponse>(`/api/projects/${project.id}/complete`, {
        method: "POST",
      })
      await refreshProject("项目已标记完成")
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "项目完成操作失败",
      })
    } finally {
      setWorkingAction(null)
    }
  }

  function resetChapterForm() {
    setNewChapter({
      title: "",
      chapterNo: "",
    })
  }

  function openChapterDialog() {
    // 新增章节从项目详情页直接发起，避免作者再进入单独的章节管理页面。
    setMessage(null)
    setChapterDialogOpen(true)
  }

  async function handleCreateChapter() {
    if (!project) {
      return
    }

    const title = newChapter.title.trim()
    const chapterNoText = newChapter.chapterNo.trim()
    const parsedChapterNo = chapterNoText ? Number(chapterNoText) : null

    if (!title) {
      setMessage({
        type: "error",
        text: "请输入章节标题",
      })
      return
    }

    if (!chapterNoText) {
      setMessage({
        type: "error",
        text: "请输入章节号",
      })
      return
    }

    if (parsedChapterNo !== null && (!Number.isInteger(parsedChapterNo) || parsedChapterNo <= 0)) {
      setMessage({
        type: "error",
        text: "章节号必须是正整数",
      })
      return
    }

    setCreatingChapter(true)
    setMessage(null)

    try {
      const response = await fetchJson<ProjectDetailResponse>(`/api/projects/${project.id}/chapters`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          chapterNo: parsedChapterNo,
        }),
      })

      setProject(response.project)
      resetChapterForm()
      setChapterDialogOpen(false)
      setMessage({
        type: "success",
        text: "章节已创建",
      })
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "章节创建失败",
      })
    } finally {
      setCreatingChapter(false)
    }
  }

  async function handleDeleteChapter() {
    if (!project || !deleteTarget) {
      return
    }

    setDeletingChapterId(deleteTarget.docId)
    setMessage(null)

    try {
      const response = await fetchJson<ProjectDetailResponse>(`/api/projects/${project.id}/chapters/${deleteTarget.docId}`, {
        method: "DELETE",
      })

      setProject(response.project)
      setDeleteTarget(null)
      setMessage({
        type: "success",
        text: "章节已删除",
      })
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "章节删除失败",
      })
    } finally {
      setDeletingChapterId(null)
    }
  }

  function openChapterNumberDialog(chapter: ProjectChapterLocator) {
    // 弹窗始终使用数据库中的结构化章节号初始化，避免从“第 X 章”展示文字反向解析造成误差。
    setChapterNumberTarget(chapter)
    setChapterTitleValue(chapter.title)
    setChapterNumberValue(chapter.chapterNo?.toString() ?? "")
    setChapterNumberError(null)
  }

  async function handleUpdateChapterNumber() {
    if (!project || !chapterNumberTarget) {
      return
    }

    const chapterNoText = chapterNumberValue.trim()
    const chapterTitle = chapterTitleValue.trim()
    const parsedChapterNo = Number(chapterNoText)

    if (!chapterTitle) {
      setChapterNumberError("章节标题不能为空")
      return
    }

    if (!chapterNoText || !Number.isInteger(parsedChapterNo) || parsedChapterNo <= 0) {
      setChapterNumberError("章节号必须是正整数")
      return
    }

    setUpdatingChapterNumber(true)
    setChapterNumberError(null)

    try {
      const response = await fetchJson<ProjectDetailResponse>(
        `/api/projects/${project.id}/chapters/${chapterNumberTarget.docId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: chapterTitle,
            chapterNo: parsedChapterNo,
          }),
        },
      )

      setProject(response.project)
      setChapterNumberTarget(null)
      setChapterTitleValue("")
      setChapterNumberValue("")
      setMessage({
        type: "success",
        text: `章节信息已更新为第 ${parsedChapterNo} 章`,
      })
    } catch (error) {
      setChapterNumberError(error instanceof Error ? error.message : "章节号修改失败")
    } finally {
      setUpdatingChapterNumber(false)
    }
  }

  if (loading) {
    return <div className="rounded-md border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">正在加载项目详情...</div>
  }

  if (!project) {
    return (
      <div className="flex flex-col gap-4">
        {message && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{message.text}</div>
        )}
        <Card className="px-4 py-10 text-center text-sm text-muted-foreground">项目不存在，或你无权访问当前项目。</Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["我的项目", project.title]}
        showBorder={false}
        actions={readonly ? <StatusBadge label="只读" tone="neutral" /> : undefined}
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

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* 顶部只放项目摘要信息，让右侧操作卡能和这块面板保持接近的视觉高度。 */}
        <Card className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-5">
          <HeaderField label="生命周期">
            <StatusBadge label={t(PROJECT_LIFECYCLE_LABEL_KEYS[project.lifecycle])} tone={PROJECT_LIFECYCLE_TONE[project.lifecycle]} />
          </HeaderField>
          <HeaderField label="当前阶段">
            <StatusBadge label={t(PROJECT_STAGE_LABEL_KEYS[project.stage])} tone={PROJECT_STAGE_TONE[project.stage]} />
          </HeaderField>
          <HeaderField label="负责编辑">
            <span className="text-sm text-foreground">{project.editor}</span>
          </HeaderField>
          <HeaderField label="负责作者">
            <span className="text-sm text-foreground">{project.author}</span>
          </HeaderField>
          <HeaderField label="创建时间">
            <span className="text-sm text-foreground">{formatDateOnly(project.createdAt)}</span>
          </HeaderField>
        </Card>

        {/* 项目操作只保留项目级动作，并使用横向紧凑布局，避免右侧卡片比左侧摘要面板高出一截。 */}
        <Card className="h-fit p-3">
          <div className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold text-foreground">项目操作</h2>

            {hasActionItems ? (
              <>
                {readonly && (
                  <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
                    当前项目已进入只读状态，暂不支持继续协作操作，但仍可导出项目终稿。
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {(role === "editor" || role === "admin") && (
                    <Button asChild size="sm" variant="outline" className="h-7 w-full justify-center bg-transparent px-2 text-xs">
                      <Link href={`/projects/${project.id}/qc`}>
                        <ClipboardCheck className="mr-1 size-3.5" />
                        质检管理
                      </Link>
                    </Button>
                  )}

                  {!readonly && (role === "editor" || role === "admin") && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-full justify-center bg-transparent px-2 text-xs"
                      disabled={!canUnlockRelease || workingAction === "unlock"}
                      onClick={() => void handleUnlockRelease()}
                    >
                      {canUnlockRelease ? <Unlock className="mr-1 size-3.5" /> : <Lock className="mr-1 size-3.5" />}
                      {workingAction === "unlock" ? "解锁中..." : "手动解锁质检"}
                    </Button>
                  )}

                  {canComplete && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-full justify-center bg-transparent px-2 text-xs"
                      disabled={workingAction === "complete"}
                      onClick={() => void handleCompleteProject()}
                    >
                      <CheckCircle2 className="mr-1 size-3.5" />
                      {workingAction === "complete" ? "处理中..." : "标记项目完成"}
                    </Button>
                  )}

                  {canExportProject && (
                    <Button asChild size="sm" variant="outline" className="h-7 w-full justify-center bg-transparent px-2 text-xs">
                      <a href={`/api/projects/${project.id}/export?scope=project&format=docx`}>
                        <Download className="mr-1 size-3.5" />
                        {readonly ? "导出项目终稿" : "导出项目"}
                      </a>
                    </Button>
                  )}

                  {!readonly && canExportRelease && (
                    <Button asChild size="sm" variant="outline" className="h-7 w-full justify-center bg-transparent px-2 text-xs">
                      <a href={`/api/projects/${project.id}/export?scope=release&format=docx`}>
                        <Download className="mr-1 size-3.5" />
                        导出全文质检
                      </a>
                    </Button>
                  )}
                </div>
              </>
            ) : readonly ? (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
                当前项目已进入只读状态，暂不支持继续协作操作。
              </div>
            ) : (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
                当前阶段暂无项目级操作。
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <StageProgress project={project} />
      </Card>

      <ProjectDocumentPanel
        project={project}
        canManageChapters={canManageChapters}
        deletingChapterId={deletingChapterId}
        onCreateChapter={openChapterDialog}
        onEditChapterNumber={openChapterNumberDialog}
        onDeleteChapter={setDeleteTarget}
      />

      <StagePlanTable project={project} editable={false} />

      <Dialog
        open={chapterDialogOpen}
        onOpenChange={(open) => {
          if (creatingChapter) {
            return
          }

          setChapterDialogOpen(open)

          if (!open) {
            resetChapterForm()
          }
        }}
      >
        <DialogContent className={CHAPTER_DIALOG_WIDTH_CLASS}>
          <DialogHeader>
            <DialogTitle>新增章节</DialogTitle>
            <DialogDescription>填写章节号和章节标题，创建后会立即显示在正文章节列表中。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-[140px_minmax(0,1fr)]">
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="chapter-no">
                章节号
              </label>
              <Input
                id="chapter-no"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={newChapter.chapterNo}
                onChange={(event) => setNewChapter((current) => ({ ...current, chapterNo: event.target.value }))}
                placeholder="例如：4"
                disabled={creatingChapter}
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="chapter-title">
                章节标题
              </label>
              <Input
                id="chapter-title"
                value={newChapter.title}
                onChange={(event) => setNewChapter((current) => ({ ...current, title: event.target.value }))}
                placeholder="例如：第四章 暗巷的修士"
                disabled={creatingChapter}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="bg-transparent"
              disabled={creatingChapter}
              onClick={() => setChapterDialogOpen(false)}
            >
              取消
            </Button>
            <Button type="button" disabled={creatingChapter} onClick={() => void handleCreateChapter()}>
              <Plus className="mr-1.5 size-4" />
              {creatingChapter ? "创建中..." : "创建章节"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(chapterNumberTarget)}
        onOpenChange={(open) => {
          if (!open && !updatingChapterNumber) {
            setChapterNumberTarget(null)
            setChapterTitleValue("")
            setChapterNumberValue("")
            setChapterNumberError(null)
          }
        }}
      >
        <DialogContent className={CHAPTER_DIALOG_WIDTH_CLASS}>
          <DialogHeader>
            <DialogTitle>修改章节信息</DialogTitle>
            <DialogDescription>
              可同时纠正章节号和标题中的序号文字。全文质检将按修改后的章节号排序生成。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-[140px_minmax(0,1fr)]">
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="edit-chapter-no">
                新章节号
              </label>
              <Input
                id="edit-chapter-no"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={chapterNumberValue}
                onChange={(event) => {
                  setChapterNumberValue(event.target.value)
                  setChapterNumberError(null)
                }}
                disabled={updatingChapterNumber}
                autoFocus
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="edit-chapter-title">
                章节标题
              </label>
              <Input
                id="edit-chapter-title"
                value={chapterTitleValue}
                onChange={(event) => {
                  setChapterTitleValue(event.target.value)
                  setChapterNumberError(null)
                }}
                disabled={updatingChapterNumber}
              />
            </div>
            {chapterNumberError && <p className="text-sm text-red-600 md:col-span-2">{chapterNumberError}</p>}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="bg-transparent"
              disabled={updatingChapterNumber}
              onClick={() => {
                setChapterNumberTarget(null)
                setChapterTitleValue("")
              }}
            >
              取消
            </Button>
            <Button type="button" disabled={updatingChapterNumber} onClick={() => void handleUpdateChapterNumber()}>
              {updatingChapterNumber ? "保存中..." : "保存章节信息"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && !deletingChapterId && setDeleteTarget(null)}>
        <DialogContent className={CHAPTER_DIALOG_WIDTH_CLASS}>
          <DialogHeader>
            <DialogTitle>确认删除章节</DialogTitle>
            <DialogDescription>仅未提交的草稿章节可以删除；删除后会归档当前草稿并取消相关待办。</DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <div className="rounded-md border border-border bg-muted px-4 py-3 text-sm text-foreground">
              {deleteTarget.title}
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="bg-transparent"
              disabled={Boolean(deletingChapterId)}
              onClick={() => setDeleteTarget(null)}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!deleteTarget || Boolean(deletingChapterId)}
              onClick={() => void handleDeleteChapter()}
            >
              {deletingChapterId ? "删除中..." : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function HeaderField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

function ProjectDocumentPanel({
  project,
  canManageChapters,
  deletingChapterId,
  onCreateChapter,
  onEditChapterNumber,
  onDeleteChapter,
}: {
  project: ProjectDetailView
  canManageChapters: boolean
  deletingChapterId: string | null
  onCreateChapter: () => void
  onEditChapterNumber: (chapter: ProjectChapterLocator) => void
  onDeleteChapter: (chapter: ProjectChapterLocator) => void
}) {
  const fixedDocs = [
    {
      key: "synopsis",
      label: "梗概",
      docId: project.docDirectory.synopsisDocId,
      summary: project.docSummary.find((item) => item.key === "synopsis"),
    },
    {
      key: "outline",
      label: "细纲",
      docId: project.docDirectory.outlineDocId,
      summary: project.docSummary.find((item) => item.key === "outline"),
    },
    {
      key: "release",
      label: "质检",
      docId: project.docDirectory.releaseDocId,
      summary: project.docSummary.find((item) => item.key === "release"),
    },
  ]
  // 项目详情与全文质检共用同一套章节号排序规则，作者保存新章节号后可以立即看到真实的质检顺序。
  const chapters = [...project.docDirectory.chapterDocs].sort(compareChaptersByChapterNo)

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-1 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">项目文档</h2>
          <p className="mt-1 text-xs text-muted-foreground">正在进行中和已定稿的项目，都可以从这里进入对应文档页面。</p>
        </div>
        {canManageChapters && (
          <Button type="button" size="sm" variant="outline" className="bg-transparent" onClick={onCreateChapter}>
            <Plus className="mr-1.5 size-4" />
            新增章节
          </Button>
        )}
      </div>

      <div className="grid gap-0 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="border-b border-border p-5 lg:border-b-0 lg:border-r">
          <h3 className="mb-3 text-xs font-semibold uppercase text-muted-foreground">阶段 Doc</h3>
          <div className="flex flex-col gap-2">
            {fixedDocs.map((doc) => (
              <DocEntry
                key={doc.key}
                href={doc.docId ? `/projects/${project.id}/docs/${doc.docId}` : null}
                title={doc.label}
                statusLabel={doc.summary?.statusLabel ?? "未生成"}
                tone={doc.summary?.tone ?? "neutral"}
              />
            ))}
          </div>
        </div>

        <div className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">正文章节</h3>
            <span className="text-xs text-muted-foreground">
              {project.approvedChapters}/{project.totalChapters} 章已定稿
            </span>
          </div>

          {chapters.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              正文阶段还没有章节。进入正文阶段后，可先创建章节再开始协作。
            </div>
          ) : (
            <div className="max-h-[360px] overflow-y-auto rounded-md border border-border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="sticky top-0 z-10 bg-muted/70 backdrop-blur">
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">章节</th>
                    <th className="px-3 py-2 font-medium">状态</th>
                    <th className="px-3 py-2 font-medium">持有人</th>
                    <th className="px-3 py-2 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {chapters.map((chapter) => (
                    <ChapterEntry
                      key={chapter.docId}
                      projectId={project.id}
                      chapter={chapter}
                      canManageChapters={canManageChapters}
                      deleting={deletingChapterId === chapter.docId}
                      onEditChapterNumber={onEditChapterNumber}
                      onDeleteChapter={onDeleteChapter}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

function DocEntry({
  href,
  title,
  statusLabel,
  tone,
}: {
  href: string | null
  title: string
  statusLabel: string
  tone: BadgeTone
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium text-foreground">{title}</span>
        <StatusBadge label={statusLabel} tone={tone} />
      </div>
      {href ? (
        <Button asChild size="sm" variant="ghost" className="h-7 shrink-0 px-2">
          <Link href={href}>进入</Link>
        </Button>
      ) : (
        <span className="shrink-0 text-xs text-muted-foreground">未生成</span>
      )}
    </div>
  )
}

function ChapterEntry({
  projectId,
  chapter,
  canManageChapters,
  deleting,
  onEditChapterNumber,
  onDeleteChapter,
}: {
  projectId: string
  chapter: ProjectChapterLocator
  canManageChapters: boolean
  deleting: boolean
  onEditChapterNumber: (chapter: ProjectChapterLocator) => void
  onDeleteChapter: (chapter: ProjectChapterLocator) => void
}) {
  const t = useT()
  const chapterLabel = chapter.chapterNo ? `第 ${chapter.chapterNo} 章` : `排序 ${chapter.sortOrder}`
  // “未提交”在 Doc 状态上对应草稿；退回章节已经经历过提交，不在项目详情列表里提供删除入口。
  const canDeleteChapter = canManageChapters && chapter.status === "draft"

  return (
    <tr className="border-b border-border last:border-b-0 hover:bg-muted/30">
      <td className="px-3 py-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">{chapterLabel}</span>
          <Link
            href={`/projects/${projectId}/docs/${chapter.docId}`}
            className="line-clamp-1 font-medium text-foreground hover:text-primary hover:underline"
          >
            {chapter.title}
          </Link>
        </div>
      </td>
      <td className="px-3 py-2">
        <StatusBadge label={t(DOC_STATUS_LABEL_KEYS[chapter.status])} tone={DOC_STATUS_TONE[chapter.status]} />
      </td>
      <td className="px-3 py-2">
        <StatusBadge label={t(HOLDER_ROLE_LABEL_KEYS[chapter.holderRole])} tone="neutral" />
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <Button asChild size="sm" variant="ghost" className="h-7 px-2" title="进入当前稿件">
            <Link href={`/projects/${projectId}/docs/${chapter.docId}`}>
              <FileText className="size-3.5" />
            </Link>
          </Button>
          <Button asChild size="sm" variant="ghost" className="h-7 px-2" title="历史版本">
            <Link href={`/projects/${projectId}/docs/${chapter.docId}/versions`}>
              <History className="size-3.5" />
            </Link>
          </Button>
          <Button asChild size="sm" variant="ghost" className="h-7 px-2" title="阅读模式">
            <Link href={`/projects/${projectId}/docs/${chapter.docId}/clean`}>
              <BookOpen className="size-3.5" />
            </Link>
          </Button>
          {canManageChapters && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              title="修改章节号和标题"
              onClick={() => onEditChapterNumber(chapter)}
            >
              <Pencil className="size-3.5" />
            </Button>
          )}
          {canDeleteChapter && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-red-600 hover:text-red-600"
              title="删除未提交章节"
              disabled={deleting}
              onClick={() => onDeleteChapter(chapter)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </td>
    </tr>
  )
}
