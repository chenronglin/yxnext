"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

import { PageHeader } from "@/components/page-header"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/status-badge"
import { StageProgress } from "@/components/project/stage-progress"
import { StagePlanTable } from "@/components/project/stage-plan-table"
import { useRole } from "@/components/role-provider"
import { fetchJson } from "@/lib/api"
import { DOC_STATUS_LABELS, HOLDER_ROLE_LABELS, PROJECT_LIFECYCLE_LABELS, PROJECT_STAGE_LABELS } from "@/types/domain"
import type { BadgeTone } from "@/types/domain"
import {
  DOC_STATUS_TONE,
  PROJECT_LIFECYCLE_TONE,
  PROJECT_STAGE_TONE,
  type ProjectChapterLocator,
  type ProjectDetail as ProjectDetailView,
} from "@/types/project"
import { Plus, Unlock, CheckCircle2, Download, Lock, FileText, History, BookOpen, Layers3 } from "lucide-react"

type ProjectDetailResponse = {
  project: ProjectDetailView
}

export function ProjectDetail({ id }: { id: string }) {
  const { role } = useRole()
  const [project, setProject] = useState<ProjectDetailView | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null)
  const [workingAction, setWorkingAction] = useState<null | "unlock" | "complete">(null)

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
  const canComplete = Boolean(project && project.releaseDocStatus === "approved" && (role === "editor" || role === "admin"))
  const canManageChapters = Boolean(
    project && project.stage === "chapter" && (role === "admin" || role === "editor" || role === "author"),
  )
  const canExportProject = role === "editor" || role === "admin"
  const hasActionItems = canManageChapters || canUnlockRelease || canComplete || canExportProject

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
            <StatusBadge label={PROJECT_LIFECYCLE_LABELS[project.lifecycle]} tone={PROJECT_LIFECYCLE_TONE[project.lifecycle]} />
          </HeaderField>
          <HeaderField label="当前阶段">
            <StatusBadge label={PROJECT_STAGE_LABELS[project.stage]} tone={PROJECT_STAGE_TONE[project.stage]} />
          </HeaderField>
          <HeaderField label="负责编辑">
            <span className="text-sm text-foreground">{project.editor}</span>
          </HeaderField>
          <HeaderField label="负责作者">
            <span className="text-sm text-foreground">{project.author}</span>
          </HeaderField>
          <HeaderField label="创建时间">
            <span className="text-sm text-foreground">{formatDate(project.createdAt)}</span>
          </HeaderField>
        </Card>

        {/* 项目操作只保留项目级动作，并使用横向紧凑布局，避免右侧卡片比左侧摘要面板高出一截。 */}
        <Card className="h-fit p-3">
          <div className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold text-foreground">项目操作</h2>

            {readonly ? (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
                当前项目已进入只读状态，暂不支持继续协作操作。
              </div>
            ) : hasActionItems ? (
              <div className="grid grid-cols-2 gap-2">
                {canManageChapters && (
                  <Button asChild size="sm" variant="outline" className="h-7 w-full justify-center bg-transparent px-2 text-xs">
                    <Link href={`/projects/${project.id}/chapters`}>
                      <Plus className="mr-1 size-3.5" />
                      新增章节
                    </Link>
                  </Button>
                )}

                {(role === "editor" || role === "admin") && (
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
                      导出项目
                    </a>
                  </Button>
                )}
              </div>
            ) : (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
                当前阶段暂无可执行操作。
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <StageProgress project={project} />
      </Card>

      <ProjectDocumentPanel project={project} />

      <StagePlanTable project={project} editable={false} />
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

function formatDate(value: string | null) {
  if (!value) return "—"
  return value.split(/[T ]/)[0]
}

function ProjectDocumentPanel({ project }: { project: ProjectDetailView }) {
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
  const chapters = [...project.docDirectory.chapterDocs].sort((left, right) => {
    const leftOrder = left.sortOrder || left.chapterNo || 0
    const rightOrder = right.sortOrder || right.chapterNo || 0
    return leftOrder - rightOrder
  })

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-1 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">项目文档</h2>
          <p className="mt-1 text-xs text-muted-foreground">正在进行中和已定稿的项目，都可以从这里进入对应文档页面。</p>
        </div>
        <Button asChild size="sm" variant="outline" className="bg-transparent">
          <Link href={`/projects/${project.id}/chapters`}>
            <Layers3 className="mr-1.5 size-4" />
            章节管理
          </Link>
        </Button>
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
                    <ChapterEntry key={chapter.docId} projectId={project.id} chapter={chapter} />
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

function ChapterEntry({ projectId, chapter }: { projectId: string; chapter: ProjectChapterLocator }) {
  const chapterLabel = chapter.chapterNo ? `第 ${chapter.chapterNo} 章` : `排序 ${chapter.sortOrder}`

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
        <StatusBadge label={DOC_STATUS_LABELS[chapter.status]} tone={DOC_STATUS_TONE[chapter.status]} />
      </td>
      <td className="px-3 py-2">
        <StatusBadge label={HOLDER_ROLE_LABELS[chapter.holderRole]} tone="neutral" />
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
        </div>
      </td>
    </tr>
  )
}
