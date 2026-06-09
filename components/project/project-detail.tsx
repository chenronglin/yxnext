"use client"

import Link from "next/link"
import { notFound } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { StageProgress } from "@/components/project/stage-progress"
import { StagePlanTable } from "@/components/project/stage-plan-table"
import { useRole } from "@/components/role-provider"
import {
  getProjectById,
  PROJECT_LIFECYCLE_TONE,
  PROJECT_STAGE_TONE,
  DOC_STATUS_TONE,
  QC_STATUS_LABELS,
  QC_STATUS_TONE,
} from "@/mocks/project-data"
import { PROJECT_LIFECYCLE_LABELS, PROJECT_STAGE_LABELS, DOC_STATUS_LABELS } from "@/types/domain"
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

export function ProjectDetail({ id }: { id: string }) {
  const project = getProjectById(id)
  const { role } = useRole()
  if (!project) notFound()

  const readonly = project.lifecycle === "completed" || project.lifecycle === "archived" || project.lifecycle === "cancelled"
  const canUnlockQc = project.stage === "manuscript" && project.approvedChapters === project.totalChapters && project.totalChapters > 0
  const canComplete = project.qcStatus === "approved"

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["我的项目", project.title]}
        title={project.title}
        description={`来源 SI：${project.sourceSi}`}
        actions={
          readonly ? <StatusBadge label="只读" tone="neutral" /> : undefined
        }
      />

      {/* 项目头部信息 */}
      <Card className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-6">
        <HeaderField label="生命周期">
          <StatusBadge
            label={PROJECT_LIFECYCLE_LABELS[project.lifecycle]}
            tone={PROJECT_LIFECYCLE_TONE[project.lifecycle]}
          />
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

      {/* 阶段进度条 */}
      <Card className="p-6">
        <StageProgress project={project} />
      </Card>

      {/* 阶段计划 */}
      <StagePlanTable project={project} editable={role === "admin"} />

      {/* Doc 区域 */}
      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">稿件 Doc</h2>
        </div>
        <div className="divide-y divide-border">
          <DocRow
            title="梗概 Doc"
            statusLabel={DOC_STATUS_LABELS.approved}
            tone={DOC_STATUS_TONE.approved}
            unlocked
            href={`/projects/${project.id}/docs/synopsis`}
          />
          <DocRow
            title="细纲 Doc"
            statusLabel={
              project.stage === "synopsis" ? "未解锁" : DOC_STATUS_LABELS.approved
            }
            tone={project.stage === "synopsis" ? "neutral" : DOC_STATUS_TONE.approved}
            unlocked={project.stage !== "synopsis"}
            href={`/projects/${project.id}/docs/outline`}
          />
          <DocRow
            title="正文章节 Doc"
            statusLabel={
              ["synopsis", "outline"].includes(project.stage)
                ? "未解锁"
                : `${project.approvedChapters}/${project.totalChapters} 章已通过`
            }
            tone={["synopsis", "outline"].includes(project.stage) ? "neutral" : "info"}
            unlocked={!["synopsis", "outline"].includes(project.stage)}
            href={`/projects/${project.id}/chapters`}
            actionLabel="管理章节"
          />
          <DocRow
            title="全文质检 Doc"
            statusLabel={QC_STATUS_LABELS[project.qcStatus]}
            tone={QC_STATUS_TONE[project.qcStatus]}
            unlocked={project.qcStatus !== "locked"}
            href={`/projects/${project.id}/qc`}
            actionLabel="全文质检"
          />
        </div>
      </Card>

      {/* 操作区 */}
      {!readonly && (
        <Card className="flex flex-wrap items-center gap-2 p-4">
          <Button asChild>
            <Link href={`/projects/${project.id}/docs/${project.stage === "done" ? "qc" : project.stage}`}>
              <FileText className="mr-1.5 size-4" />
              进入当前稿件
            </Link>
          </Button>
          <Button asChild variant="outline" className="bg-transparent">
            <Link href={`/projects/${project.id}/docs/${project.stage === "done" ? "qc" : project.stage}/versions`}>
              <History className="mr-1.5 size-4" />
              查看历史版本
            </Link>
          </Button>
          {project.stage === "manuscript" && (role === "admin" || role === "editor" || role === "author") && (
            <Button asChild variant="outline" className="bg-transparent">
              <Link href={`/projects/${project.id}/chapters`}>
                <Plus className="mr-1.5 size-4" />
                新增章节
              </Link>
            </Button>
          )}
          {role === "editor" && (
            <Button asChild variant="outline" className="bg-transparent" disabled={!canUnlockQc}>
              {canUnlockQc ? (
                <Link href={`/projects/${project.id}/qc`}>
                  <Unlock className="mr-1.5 size-4" />
                  手动解锁全文质检
                </Link>
              ) : (
                <span>
                  <Lock className="mr-1.5 size-4" />
                  手动解锁全文质检
                </span>
              )}
            </Button>
          )}
          {(role === "editor" || role === "admin") && canComplete && (
            <Button variant="outline" className="bg-transparent">
              <CheckCircle2 className="mr-1.5 size-4" />
              标记项目完成
            </Button>
          )}
          {(role === "editor" || role === "admin") && (
            <Button variant="outline" className="bg-transparent">
              <Download className="mr-1.5 size-4" />
              导出项目
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
  href: string
  actionLabel?: string
}) {
  return (
    <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        {unlocked ? (
          <FileText className="size-4 text-muted-foreground" />
        ) : (
          <Lock className="size-4 text-muted-foreground" />
        )}
        <span className="text-sm font-medium text-foreground">{title}</span>
        <StatusBadge label={statusLabel} tone={tone} />
      </div>
      {unlocked ? (
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
