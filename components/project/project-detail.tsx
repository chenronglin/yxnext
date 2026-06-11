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
import { PROJECT_LIFECYCLE_LABELS, PROJECT_STAGE_LABELS } from "@/types/domain"
import {
  PROJECT_LIFECYCLE_TONE,
  PROJECT_STAGE_TONE,
  type ProjectDetail as ProjectDetailView,
} from "@/types/project"
import { Plus, Unlock, CheckCircle2, Download, Lock } from "lucide-react"

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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-6">
          {/* 左侧仅保留项目概览与阶段进度，让顶部摘要区收紧到主内容列，避免继续占满整行。 */}
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

          <Card className="p-6">
            <StageProgress project={project} />
          </Card>
        </div>

        {/* 右侧统一收纳项目动作，替代原来表格下方分散的按钮区，便于快速执行操作。 */}
        <Card className="h-fit p-5">
          <div className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-foreground">项目操作</h2>

            {readonly ? (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
                当前项目已进入只读状态，暂不支持继续协作操作。
              </div>
            ) : hasActionItems ? (
              <div className="flex flex-col gap-2">
                {canManageChapters && (
                  <Button asChild variant="outline" className="w-full justify-start bg-transparent">
                    <Link href={`/projects/${project.id}/chapters`}>
                      <Plus className="mr-1.5 size-4" />
                      新增章节
                    </Link>
                  </Button>
                )}

                {(role === "editor" || role === "admin") && (
                  <Button
                    variant="outline"
                    className="w-full justify-start bg-transparent"
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
                    className="w-full justify-start bg-transparent"
                    disabled={workingAction === "complete"}
                    onClick={() => void handleCompleteProject()}
                  >
                    <CheckCircle2 className="mr-1.5 size-4" />
                    {workingAction === "complete" ? "处理中..." : "标记项目完成"}
                  </Button>
                )}

                {canExportProject && (
                  <Button asChild variant="outline" className="w-full justify-start bg-transparent">
                    <a href={`/api/projects/${project.id}/export?scope=project&format=docx`}>
                      <Download className="mr-1.5 size-4" />
                      导出项目
                    </a>
                  </Button>
                )}
              </div>
            ) : (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
                当前阶段暂无可执行操作。
              </div>
            )}
          </div>
        </Card>
      </div>

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
