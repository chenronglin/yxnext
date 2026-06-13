"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { use } from "react"

import { PageHeader } from "@/components/page-header"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { StatusBadge } from "@/components/status-badge"
import { useRole } from "@/components/role-provider"
import { fetchJson } from "@/lib/api"
import { DOC_STATUS_LABELS, HOLDER_ROLE_LABELS, STAGE_PLAN_STATUS_LABELS, type HolderRole } from "@/types/domain"
import { DOC_STATUS_TONE, STAGE_PLAN_TONE, type ChapterDoc } from "@/types/project"
import { Plus, FileText, History, BookOpen, Trash2, ArrowUpDown, Lock, ChevronUp, ChevronDown } from "lucide-react"

type ChaptersResponse = {
  projectId: string
  title: string
  chapters: ChapterDoc[]
  totalChapters: number
  approvedChapters: number
  stageGateStatus: "locked" | "unlocked" | "completed"
  stageTimelineStatus: "not_started" | "in_progress" | "due_soon" | "overdue" | "completed"
}

const HOLDER_TONE: Record<HolderRole, "info" | "warning" | "neutral"> = {
  author: "info",
  editor: "warning",
  none: "neutral",
}

export default function ChaptersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { role } = useRole()
  const [data, setData] = useState<ChaptersResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null)
  const [creating, setCreating] = useState(false)
  const [reorderingId, setReorderingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ChapterDoc | null>(null)
  const [newChapter, setNewChapter] = useState({
    title: "",
    chapterNo: "",
  })

  const canManage = role === "author" || role === "editor" || role === "admin"
  const unlocked = data?.stageGateStatus !== "locked"
  const orderedIds = useMemo(() => data?.chapters.map((chapter) => chapter.id) ?? [], [data?.chapters])

  async function loadChapters(successText?: string) {
    setLoading(true)

    try {
      const response = await fetchJson<ChaptersResponse>(`/api/projects/${id}/chapters`)
      setData(response)

      if (successText) {
        setMessage({
          type: "success",
          text: successText,
        })
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "章节列表读取失败",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadChapters()
  }, [id])

  async function handleCreateChapter() {
    const parsedChapterNo = newChapter.chapterNo.trim() ? Number(newChapter.chapterNo) : null

    if (!newChapter.title.trim()) {
      setMessage({
        type: "error",
        text: "请输入章节标题",
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

    setCreating(true)
    setMessage(null)

    try {
      await fetchJson(`/api/projects/${id}/chapters`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: newChapter.title,
          chapterNo: parsedChapterNo,
        }),
      })

      setNewChapter({
        title: "",
        chapterNo: "",
      })
      await loadChapters("章节已创建")
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "章节创建失败",
      })
    } finally {
      setCreating(false)
    }
  }

  async function handleReorderChapter(docId: string, direction: "up" | "down") {
    if (!data) {
      return
    }

    const currentIndex = orderedIds.findIndex((item) => item === docId)
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1

    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= orderedIds.length) {
      return
    }

    const nextIds = [...orderedIds]
    const [moved] = nextIds.splice(currentIndex, 1)
    nextIds.splice(targetIndex, 0, moved)

    setReorderingId(docId)
    setMessage(null)

    try {
      await fetchJson(`/api/projects/${id}/chapters/order`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderedDocIds: nextIds,
        }),
      })

      await loadChapters("章节排序已更新")
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "章节排序失败",
      })
    } finally {
      setReorderingId(null)
    }
  }

  async function handleDeleteChapter(docId: string) {
    setDeletingId(docId)
    setMessage(null)

    try {
      await fetchJson(`/api/projects/${id}/chapters/${docId}`, {
        method: "DELETE",
      })

      setDeleteTarget(null)
      await loadChapters("章节已删除")
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "章节删除失败",
      })
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["我的项目", data?.title ?? "正文章节", "正文章节"]}
        title="正文章节管理"
        description={data ? `${data.title} 的章节 Doc，支持真实提交、审核与推进` : "加载章节中"}
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

      {!loading && data && (
        <>
          <Card className="flex flex-wrap items-center gap-x-8 gap-y-2 p-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">正文总章节</span>
              <span className="font-semibold text-foreground">{data.totalChapters}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">已通过章节</span>
              <span className="font-semibold text-emerald-600">{data.approvedChapters}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">阶段状态</span>
              <StatusBadge
                label={STAGE_PLAN_STATUS_LABELS[data.stageTimelineStatus]}
                tone={STAGE_PLAN_TONE[data.stageTimelineStatus]}
              />
            </div>
            {data.totalChapters > 0 && data.approvedChapters === data.totalChapters && <StatusBadge label="可解锁质检" tone="success" />}
          </Card>

          {!unlocked && (
            <Card className="flex items-center gap-3 border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <Lock className="size-4 shrink-0" />
              正文阶段尚未解锁，当前只能查看章节结构；细纲通过后才可正式推进正文协作。
            </Card>
          )}

          {canManage && (
            <Card className="flex flex-col gap-4 p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">新增章节</h2>
                <StatusBadge label={unlocked ? "可写入" : "等待解锁"} tone={unlocked ? "info" : "neutral"} />
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr_140px_auto]">
                <Input
                  value={newChapter.title}
                  onChange={(event) => setNewChapter((current) => ({ ...current, title: event.target.value }))}
                  placeholder="章节标题，例如：第四章 暗巷的修士"
                  disabled={creating}
                />
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={newChapter.chapterNo}
                  onChange={(event) => setNewChapter((current) => ({ ...current, chapterNo: event.target.value }))}
                  placeholder="章节号（可选）"
                  disabled={creating}
                />
                <Button disabled={creating} onClick={() => void handleCreateChapter()}>
                  <Plus className="mr-1.5 size-4" />
                  {creating ? "创建中..." : "新增章节"}
                </Button>
              </div>
            </Card>
          )}
        </>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">排序</th>
                <th className="px-4 py-3 font-medium">章节标题</th>
                <th className="px-4 py-3 font-medium">Doc 状态</th>
                <th className="px-4 py-3 font-medium">持有人</th>
                <th className="px-4 py-3 font-medium">字数</th>
                <th className="px-4 py-3 font-medium">最近交接说明</th>
                <th className="px-4 py-3 font-medium">最近操作</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    正在加载章节...
                  </td>
                </tr>
              )}

              {!loading && data?.chapters.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    暂无章节，可以先新增章节后再进入正文协作。
                  </td>
                </tr>
              )}

              {!loading &&
                data?.chapters.map((chapter, index) => (
                  <tr key={chapter.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 text-muted-foreground">{chapter.order}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-foreground">{chapter.title}</span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge label={DOC_STATUS_LABELS[chapter.status]} tone={DOC_STATUS_TONE[chapter.status]} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge label={HOLDER_ROLE_LABELS[chapter.holder]} tone={HOLDER_TONE[chapter.holder]} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{chapter.words.toLocaleString()}</td>
                    <td className="max-w-[240px] px-4 py-3 text-muted-foreground" title={chapter.lastNote}>
                      <div className="truncate">{chapter.lastNote || "—"}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {chapter.lastOperator}
                      <br />
                      {chapter.lastOperatedAt}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button asChild size="sm" variant="ghost" className="h-8 px-2" title="进入当前稿件">
                          <Link href={`/projects/${id}/docs/${chapter.id}`}>
                            <FileText className="size-3.5" />
                          </Link>
                        </Button>
                        <Button asChild size="sm" variant="ghost" className="h-8 px-2" title="历史版本">
                          <Link href={`/projects/${id}/docs/${chapter.id}/versions`}>
                            <History className="size-3.5" />
                          </Link>
                        </Button>
                        <Button asChild size="sm" variant="ghost" className="h-8 px-2" title="阅读模式">
                          <Link href={`/projects/${id}/docs/${chapter.id}/clean`}>
                            <BookOpen className="size-3.5" />
                          </Link>
                        </Button>
                        {canManage && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2"
                              title="上移"
                              disabled={index === 0 || reorderingId === chapter.id}
                              onClick={() => void handleReorderChapter(chapter.id, "up")}
                            >
                              <ChevronUp className="size-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2"
                              title="下移"
                              disabled={index === (data?.chapters.length ?? 0) - 1 || reorderingId === chapter.id}
                              onClick={() => void handleReorderChapter(chapter.id, "down")}
                            >
                              <ChevronDown className="size-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2"
                              title="重排说明"
                              disabled
                            >
                              <ArrowUpDown className="size-3.5" />
                            </Button>
                            {!chapter.approved && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 px-2 text-red-600 hover:text-red-600"
                                title="删除章节"
                                disabled={deletingId === chapter.id}
                                onClick={() => setDeleteTarget(chapter)}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-muted-foreground">
        返回
        <Link href={`/projects/${id}`} className="mx-1 text-primary hover:underline">
          项目详情
        </Link>
        查看阶段进度与其他 Doc。
      </p>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && !deletingId && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>确认删除章节</DialogTitle>
            <DialogDescription>
              删除后会归档当前活动草稿并取消相关待办，章节内容将不再出现在项目正文列表中。
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <div className="rounded-md border border-border bg-muted px-4 py-3 text-sm text-foreground">
              {deleteTarget.title}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="bg-transparent" disabled={Boolean(deletingId)} onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={!deleteTarget || Boolean(deletingId)}
              onClick={() => deleteTarget && void handleDeleteChapter(deleteTarget.id)}
            >
              {deletingId ? "删除中..." : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
