"use client"

import Link from "next/link"
import { notFound } from "next/navigation"
import { use, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { StageProgress } from "@/components/project/stage-progress"
import { StagePlanTable } from "@/components/project/stage-plan-table"
import {
  getProjectById,
  PROJECT_LIFECYCLE_TONE,
  PROJECT_STAGE_TONE,
  QC_STATUS_LABELS,
  QC_STATUS_TONE,
  PROJECT_EDITORS,
  PROJECT_AUTHORS,
} from "@/lib/project-data"
import { AUDIT_LOGS } from "@/lib/admin-data"
import { PROJECT_LIFECYCLE_LABELS, PROJECT_STAGE_LABELS } from "@/lib/types"
import {
  UserCog,
  CheckCircle2,
  Archive,
  XCircle,
  RotateCcw,
  Download,
  FileText,
} from "lucide-react"

type GovAction = "editor" | "author" | "complete" | "archive" | "cancel" | "restore" | null

export default function GovernanceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const project = getProjectById(id)
  const [action, setAction] = useState<GovAction>(null)
  if (!project) notFound()

  const auditSummary = AUDIT_LOGS.filter((l) => l.target.includes(project.title)).slice(0, 4)
  const canComplete = project.qcStatus === "approved"

  const confirmTexts: Record<Exclude<GovAction, null>, { title: string; desc: string }> = {
    editor: { title: "调整负责编辑", desc: "调整后项目可见性将立即变化。" },
    author: { title: "调整负责作者", desc: "调整后项目可见性将立即变化。" },
    complete: { title: "标记项目完成", desc: "需全文质检 Doc 通过，或管理员确认特殊治理原因。" },
    archive: { title: "归档项目", desc: "归档后项目默认只读，可在治理列表恢复。" },
    cancel: { title: "取消项目", desc: "取消后项目默认不可继续协作，可恢复。" },
    restore: { title: "恢复项目", desc: "恢复后项目回到治理前可协作状态。" },
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["项目治理", project.title]}
        title={project.title}
        description={`来源 SI：${project.sourceSi}`}
        actions={
          <StatusBadge
            label={PROJECT_LIFECYCLE_LABELS[project.lifecycle]}
            tone={PROJECT_LIFECYCLE_TONE[project.lifecycle]}
          />
        }
      />

      {/* 基础信息 + 来源 SI + 负责人 */}
      <Card className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-6">
        <Field label="当前阶段">
          <StatusBadge label={PROJECT_STAGE_LABELS[project.stage]} tone={PROJECT_STAGE_TONE[project.stage]} />
        </Field>
        <Field label="全文质检">
          <StatusBadge label={QC_STATUS_LABELS[project.qcStatus]} tone={QC_STATUS_TONE[project.qcStatus]} />
        </Field>
        <Field label="来源 SI">
          <Link href={`/si/${project.sourceSiId}`} className="text-sm text-primary hover:underline">
            {project.sourceSi}
          </Link>
        </Field>
        <Field label="负责编辑">
          <span className="text-sm text-foreground">{project.editor}</span>
        </Field>
        <Field label="负责作者">
          <span className="text-sm text-foreground">{project.author}</span>
        </Field>
        <Field label="创建时间">
          <span className="text-sm text-foreground">{project.createdAt}</span>
        </Field>
      </Card>

      {/* 阶段进度 */}
      <Card className="p-6">
        <StageProgress project={project} />
      </Card>

      {/* 阶段计划（管理员可编辑） */}
      <StagePlanTable project={project} editable />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Doc 列表概要 */}
        <Card className="overflow-hidden">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">Doc 列表</h2>
          </div>
          <ul className="divide-y divide-border text-sm">
            <DocItem title="梗概 Doc" status="审核通过" tone="success" />
            <DocItem
              title="细纲 Doc"
              status={project.stage === "synopsis" ? "未解锁" : "审核通过"}
              tone={project.stage === "synopsis" ? "neutral" : "success"}
            />
            <DocItem
              title="正文章节 Doc"
              status={`${project.approvedChapters}/${project.totalChapters} 章通过`}
              tone="info"
            />
            <DocItem title="全文质检 Doc" status={QC_STATUS_LABELS[project.qcStatus]} tone={QC_STATUS_TONE[project.qcStatus]} />
          </ul>
        </Card>

        {/* 操作日志摘要 */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">操作日志摘要</h2>
            <Button asChild size="sm" variant="ghost" className="h-8">
              <Link href="/admin/audit">查看全部</Link>
            </Button>
          </div>
          <ul className="divide-y divide-border text-sm">
            {auditSummary.length === 0 && (
              <li className="px-4 py-6 text-center text-muted-foreground">暂无相关日志</li>
            )}
            {auditSummary.map((log) => (
              <li key={log.id} className="flex flex-col gap-1 px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">{log.action}</span>
                  <span className="text-xs text-muted-foreground">{log.time}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {log.operator}：{log.before} → {log.after}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* 治理操作区 */}
      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">治理操作</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="bg-transparent" onClick={() => setAction("editor")}>
            <UserCog className="mr-1.5 size-4" />
            调整负责编辑
          </Button>
          <Button variant="outline" className="bg-transparent" onClick={() => setAction("author")}>
            <UserCog className="mr-1.5 size-4" />
            调整负责作者
          </Button>
          <Button variant="outline" className="bg-transparent" disabled={!canComplete} onClick={() => setAction("complete")}>
            <CheckCircle2 className="mr-1.5 size-4" />
            标记完成
          </Button>
          {project.lifecycle === "cancelled" || project.lifecycle === "archived" ? (
            <Button variant="outline" className="bg-transparent" onClick={() => setAction("restore")}>
              <RotateCcw className="mr-1.5 size-4" />
              恢复
            </Button>
          ) : (
            <>
              <Button variant="outline" className="bg-transparent" onClick={() => setAction("archive")}>
                <Archive className="mr-1.5 size-4" />
                归档
              </Button>
              <Button
                variant="outline"
                className="bg-transparent text-red-600 hover:text-red-600"
                onClick={() => setAction("cancel")}
              >
                <XCircle className="mr-1.5 size-4" />
                取消
              </Button>
            </>
          )}
          <Button variant="outline" className="bg-transparent" onClick={() => setAction(null)} disabled={project.qcStatus !== "approved"}>
            <Download className="mr-1.5 size-4" />
            下载终稿
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">所有治理动作都会记录到操作日志。</p>
      </Card>

      {/* 治理操作弹窗 */}
      <Dialog open={action !== null} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action && confirmTexts[action].title}</DialogTitle>
            <DialogDescription>{action && confirmTexts[action].desc}</DialogDescription>
          </DialogHeader>

          {action === "editor" && (
            <div className="flex flex-col gap-2 py-2">
              <Label>新的负责编辑</Label>
              <Select defaultValue={project.editorId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_EDITORS.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {action === "author" && (
            <div className="flex flex-col gap-2 py-2">
              <Label>新的负责作者</Label>
              <Select defaultValue={project.authorId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_AUTHORS.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" className="bg-transparent" onClick={() => setAction(null)}>
              取消
            </Button>
            <Button
              className={action === "cancel" ? "bg-red-600 hover:bg-red-700" : ""}
              onClick={() => setAction(null)}
            >
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

function DocItem({
  title,
  status,
  tone,
}: {
  title: string
  status: string
  tone: "neutral" | "info" | "success" | "warning" | "danger"
}) {
  return (
    <li className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-2">
        <FileText className="size-4 text-muted-foreground" />
        <span className="text-foreground">{title}</span>
      </div>
      <StatusBadge label={status} tone={tone} />
    </li>
  )
}
