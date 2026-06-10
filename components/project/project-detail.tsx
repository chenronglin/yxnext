"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"

import { PageHeader } from "@/components/page-header"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/status-badge"
import { StageProgress } from "@/components/project/stage-progress"
import { StagePlanTable } from "@/components/project/stage-plan-table"
import { useRole } from "@/components/role-provider"
import { fetchJson } from "@/lib/api"
import { DOC_STATUS_LABELS, PROJECT_LIFECYCLE_LABELS, PROJECT_STAGE_LABELS } from "@/types/domain"
import {
  DOC_STATUS_TONE,
  PROJECT_LIFECYCLE_TONE,
  PROJECT_STAGE_TONE,
  RELEASE_DOC_STATUS_LABELS,
  RELEASE_DOC_STATUS_TONE,
  type ProjectDetail as ProjectDetailView,
} from "@/types/project"
import {
  FileText,
  History,
  Plus,
  Unlock,
  CheckCircle2,
  Download,
  Lock,
  ArrowRight,
} from "lucide-react"

type ProjectDetailResponse = {
  project: ProjectDetailView
}

function firstChapterDocId(project: ProjectDetailView) {
  const pendingChapter = project.docDirectory.chapterDocs.find((item) => item.status !== "approved")

  return pendingChapter?.docId ?? project.docDirectory.chapterDocs[0]?.docId ?? null
}

function currentDocHref(project: ProjectDetailView) {
  if (project.stage === "synopsis") {
    return project.docDirectory.synopsisDocId ? `/projects/${project.id}/docs/${project.docDirectory.synopsisDocId}` : null
  }

  if (project.stage === "outline") {
    return project.docDirectory.outlineDocId ? `/projects/${project.id}/docs/${project.docDirectory.outlineDocId}` : null
  }

  if (project.stage === "chapter") {
    const chapterDocId = firstChapterDocId(project)
    return chapterDocId ? `/projects/${project.id}/docs/${chapterDocId}` : `/projects/${project.id}/chapters`
  }

  if (project.stage === "release") {
    return project.docDirectory.releaseDocId ? `/projects/${project.id}/docs/${project.docDirectory.releaseDocId}` : `/projects/${project.id}/qc`
  }

  return project.docDirectory.releaseDocId ? `/projects/${project.id}/docs/${project.docDirectory.releaseDocId}` : null
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
  const entryHref = project ? currentDocHref(project) : null
  const versionHref = useMemo(() => {
    if (!project) {
      return null
    }

    if (project.stage === "chapter") {
      const chapterDocId = firstChapterDocId(project)
      return chapterDocId ? `/projects/${project.id}/docs/${chapterDocId}/versions` : null
    }

    if (project.stage === "synopsis" && project.docDirectory.synopsisDocId) {
      return `/projects/${project.id}/docs/${project.docDirectory.synopsisDocId}/versions`
    }

    if (project.stage === "outline" && project.docDirectory.outlineDocId) {
      return `/projects/${project.id}/docs/${project.docDirectory.outlineDocId}/versions`
    }

    if (project.docDirectory.releaseDocId) {
      return `/projects/${project.id}/docs/${project.docDirectory.releaseDocId}/versions`
    }

    return null
  }, [project])

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
        title={project.title}
        description={`来源 SI：${project.sourceSi}`}
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

      <Card className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-6">
        <HeaderField label="生命周期">
          <StatusBadge label={PROJECT_LIFECYCLE_LABELS[project.lifecycle]} tone={PROJECT_LIFECYCLE_TONE[project.lifecycle]} />
        </HeaderField>
        <HeaderField label="当前阶段">
          <StatusBadge label={PROJECT_STAGE_LABELS[project.stage]} tone={PROJECT_STAGE_TONE[project.stage]} />
        </HeaderField>
        <HeaderField label="来源 SI">
          <Link href={`/si/${project.sourceSiId}`} className="text-sm text-primary hover:underline">
            {project.sourceSi}
          </Link>
        </HeaderField>
        <HeaderField label="负责编辑">
          <span className="text-sm text-foreground">{project.editor}</span>
        </HeaderField>
        <HeaderField label="负责作者">
          <span className="text-sm text-foreground">{project.author}</span>
        </HeaderField>
        <HeaderField label="创建时间">
          <span className="text-sm text-foreground">{project.createdAt}</span>
        </HeaderField>
      </Card>

      <Card className="p-6">
        <StageProgress project={project} />
      </Card>

      <StagePlanTable project={project} editable={false} />

      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">稿件 Doc</h2>
        </div>
        <div className="divide-y divide-border">
          <DocRow
            title="梗概 Doc"
            statusLabel={project.docDirectory.synopsisDocId ? project.docSummary.find((item) => item.key === "synopsis")?.statusLabel ?? DOC_STATUS_LABELS.approved : "未创建"}
            tone={project.docSummary.find((item) => item.key === "synopsis")?.tone ?? "neutral"}
            unlocked={Boolean(project.docDirectory.synopsisDocId)}
            href={project.docDirectory.synopsisDocId ? `/projects/${project.id}/docs/${project.docDirectory.synopsisDocId}` : null}
          />
          <DocRow
            title="细纲 Doc"
            statusLabel={project.docSummary.find((item) => item.key === "outline")?.statusLabel ?? "未解锁"}
            tone={project.docSummary.find((item) => item.key === "outline")?.tone ?? "neutral"}
            unlocked={Boolean(project.docDirectory.outlineDocId)}
            href={project.docDirectory.outlineDocId ? `/projects/${project.id}/docs/${project.docDirectory.outlineDocId}` : null}
          />
          <DocRow
            title="正文章节 Doc"
            statusLabel={`${project.approvedChapters}/${project.totalChapters} 章已通过`}
            tone={project.totalChapters > 0 ? "info" : "neutral"}
            unlocked={project.totalChapters > 0}
            href={`/projects/${project.id}/chapters`}
            actionLabel="管理章节"
          />
          <DocRow
            title="质检 Doc"
            statusLabel={RELEASE_DOC_STATUS_LABELS[project.releaseDocStatus]}
            tone={RELEASE_DOC_STATUS_TONE[project.releaseDocStatus]}
            unlocked={project.releaseDocStatus !== "locked"}
            href={project.docDirectory.releaseDocId ? `/projects/${project.id}/docs/${project.docDirectory.releaseDocId}` : `/projects/${project.id}/qc`}
            actionLabel={project.releaseDocStatus === "locked" ? "查看质检条件" : "进入质检"}
          />
        </div>
      </Card>

      {!readonly && (
        <Card className="flex flex-wrap items-center gap-2 p-4">
          {entryHref && (
            <Button asChild>
              <Link href={entryHref}>
                <FileText className="mr-1.5 size-4" />
                进入当前稿件
              </Link>
            </Button>
          )}

          {versionHref && (
            <Button asChild variant="outline" className="bg-transparent">
              <Link href={versionHref}>
                <History className="mr-1.5 size-4" />
                查看历史版本
              </Link>
            </Button>
          )}

          {project.stage === "chapter" && (role === "admin" || role === "editor" || role === "author") && (
            <Button asChild variant="outline" className="bg-transparent">
              <Link href={`/projects/${project.id}/chapters`}>
                <Plus className="mr-1.5 size-4" />
                新增章节
              </Link>
            </Button>
          )}

          {(role === "editor" || role === "admin") && (
            <Button
              variant="outline"
              className="bg-transparent"
              disabled={!canUnlockRelease || workingAction === "unlock"}
              onClick={() => void handleUnlockRelease()}
            >
              {canUnlockRelease ? <Unlock className="mr-1.5 size-4" /> : <Lock className="mr-1.5 size-4" />}
              {workingAction === "unlock" ? "解锁中..." : "手动解锁质检"}
            </Button>
          )}

          {canComplete && (
            <Button
              variant="outline"
              className="bg-transparent"
              disabled={workingAction === "complete"}
              onClick={() => void handleCompleteProject()}
            >
              <CheckCircle2 className="mr-1.5 size-4" />
              {workingAction === "complete" ? "处理中..." : "标记项目完成"}
            </Button>
          )}

          {(role === "editor" || role === "admin") && (
            <Button asChild variant="outline" className="bg-transparent">
              <a href={`/api/projects/${project.id}/export?scope=project&format=docx`}>
                <Download className="mr-1.5 size-4" />
                导出项目
              </a>
            </Button>
          )}
        </Card>
      )}
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

function DocRow({
  title,
  statusLabel,
  tone,
  unlocked,
  href,
  actionLabel = "进入",
}: {
  title: string
  statusLabel: string
  tone: "neutral" | "info" | "success" | "warning" | "danger"
  unlocked: boolean
  href: string | null
  actionLabel?: string
}) {
  return (
    <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        {unlocked ? <FileText className="size-4 text-muted-foreground" /> : <Lock className="size-4 text-muted-foreground" />}
        <span className="text-sm font-medium text-foreground">{title}</span>
        <StatusBadge label={statusLabel} tone={tone} />
      </div>

      {unlocked && href ? (
        <Button asChild size="sm" variant="outline" className="bg-transparent">
          <Link href={href}>
            {actionLabel}
            <ArrowRight className="ml-1 size-3.5" />
          </Link>
        </Button>
      ) : (
        <span className="text-xs text-muted-foreground">未达到解锁条件</span>
      )}
    </div>
  )
}
