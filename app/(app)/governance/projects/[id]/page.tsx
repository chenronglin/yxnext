"use client"

import Link from "next/link"
import { use, useEffect, useState } from "react"
import {
  Archive,
  CheckCircle2,
  Download,
  RotateCcw,
  UserCog,
  XCircle,
} from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { StagePlanTable } from "@/components/project/stage-plan-table"
import { StageProgress } from "@/components/project/stage-progress"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { fetchJson } from "@/lib/api"
import {
  PROJECT_LIFECYCLE_LABELS,
  PROJECT_STAGE_LABELS,
} from "@/types/domain"
import {
  PROJECT_LIFECYCLE_TONE,
  PROJECT_STAGE_TONE,
  QC_STATUS_LABELS,
  QC_STATUS_TONE,
  type GovernanceProjectDetail,
  type ProjectPersonOption,
} from "@/types/project"

type GovernanceDetailResponse = {
  project: GovernanceProjectDetail
  editors: ProjectPersonOption[]
  authors: ProjectPersonOption[]
}

type GovAction = "editor" | "author" | "complete" | "archive" | "cancel" | "restore" | null

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString("zh-CN") : "—"
}

export default function GovernanceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [project, setProject] = useState<GovernanceProjectDetail | null>(null)
  const [editors, setEditors] = useState<ProjectPersonOption[]>([])
  const [authors, setAuthors] = useState<ProjectPersonOption[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [savingStagePlans, setSavingStagePlans] = useState(false)
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null)
  const [action, setAction] = useState<GovAction>(null)
  const [selectedEditorId, setSelectedEditorId] = useState("")
  const [selectedAuthorId, setSelectedAuthorId] = useState("")
  const [reason, setReason] = useState("")

  async function loadProject() {
    // 治理详情页的基础信息、负责人候选项和审计摘要都从同一接口返回，避免前端自己拼装。
    setLoading(true)
    setMessage(null)

    try {
      const response = await fetchJson<GovernanceDetailResponse>(`/api/admin/projects/${id}`)
      setProject(response.project)
      setEditors(response.editors)
      setAuthors(response.authors)
      setSelectedEditorId(response.project.editorId)
      setSelectedAuthorId(response.project.authorId)
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "项目详情读取失败",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadProject()
  }, [id])

  function openAction(nextAction: Exclude<GovAction, null>) {
    // 每次打开治理弹窗时都按最新项目负责人重置选择和说明，避免沿用上一次操作残留。
    if (project) {
      setSelectedEditorId(project.editorId)
      setSelectedAuthorId(project.authorId)
    }
    setReason("")
    setAction(nextAction)
  }

  async function handleSaveAssignment() {
    if (!project || !action || !["editor", "author"].includes(action) || submitting) return

    setSubmitting(true)
    setMessage(null)

    try {
      await fetchJson<GovernanceDetailResponse>(`/api/admin/projects/${project.id}/assignment`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          editorId: action === "editor" ? selectedEditorId : undefined,
          authorId: action === "author" ? selectedAuthorId : undefined,
          reason: reason || null,
        }),
      })

      setMessage({
        type: "success",
        text: action === "editor" ? "负责编辑已调整" : "负责作者已调整",
      })
      setAction(null)
      await loadProject()
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "归属调整失败",
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleTransition() {
    if (!project || !action || ["editor", "author"].includes(action) || submitting) return

    setSubmitting(true)
    setMessage(null)

    try {
      await fetchJson<GovernanceDetailResponse>(`/api/admin/projects/${project.id}/${action}`, {
        method: "POST",
      })

      setMessage({
        type: "success",
        text:
          action === "complete"
            ? "项目已标记完成"
            : action === "archive"
              ? "项目已归档"
              : action === "cancel"
                ? "项目已取消"
                : "项目已恢复",
      })
      setAction(null)
      await loadProject()
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "治理动作执行失败",
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSaveStagePlans(items: Array<{ stage: "synopsis" | "outline" | "manuscript" | "qc"; planDays: number }>) {
    if (!project) return

    setSavingStagePlans(true)
    setMessage(null)

    try {
      await fetchJson<GovernanceDetailResponse>(`/api/admin/projects/${project.id}/stage-plans`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ items }),
      })

      setMessage({
        type: "success",
        text: "阶段计划已更新",
      })
      await loadProject()
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "阶段计划保存失败",
      })
      throw error
    } finally {
      setSavingStagePlans(false)
    }
  }

  async function handleDownloadFinal() {
    if (!project || submitting) return

    setSubmitting(true)
    setMessage(null)

    try {
      // 下载接口返回附件流而不是 JSON，因此这里直接使用 fetch 读取 blob。
      const response = await fetch(`/api/admin/projects/${project.id}/download-final`)

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.message ?? "终稿下载失败")
      }

      const blob = await response.blob()
      const contentDisposition = response.headers.get("Content-Disposition") ?? ""
      const filenameMatch = contentDisposition.match(/filename\*=UTF-8''(.+)$/)
      const filename = filenameMatch ? decodeURIComponent(filenameMatch[1]) : `${project.title}.md`
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement("a")

      anchor.href = url
      anchor.download = filename
      anchor.click()
      window.URL.revokeObjectURL(url)

      setMessage({
        type: "success",
        text: "终稿已开始下载",
      })
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "终稿下载失败",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const confirmTexts: Record<Exclude<GovAction, null>, { title: string; desc: string }> = {
    editor: { title: "调整负责编辑", desc: "调整后项目可见性将立即变化。" },
    author: { title: "调整负责作者", desc: "调整后项目可见性将立即变化。" },
    complete: { title: "标记项目完成", desc: "只有全文质检通过的项目才能标记完成。" },
    archive: { title: "归档项目", desc: "归档后项目默认只读，可在治理列表恢复。" },
    cancel: { title: "取消项目", desc: "取消后项目默认不可继续协作，可恢复。" },
    restore: { title: "恢复项目", desc: "恢复后项目回到治理前可协作状态。" },
  }

  const canComplete = project?.qcStatus === "approved"

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["项目治理", project?.title ?? "详情"]}
        title={project?.title ?? "项目治理详情"}
        description={project ? `来源 SI：${project.sourceSi}` : "正在加载项目详情"}
        actions={
          project ? (
            <StatusBadge
              label={PROJECT_LIFECYCLE_LABELS[project.lifecycle]}
              tone={PROJECT_LIFECYCLE_TONE[project.lifecycle]}
            />
          ) : undefined
        }
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

      {loading && <Card className="p-10 text-center text-sm text-muted-foreground">正在加载项目治理详情...</Card>}

      {!loading && !project && (
        <Card className="p-10 text-center text-sm text-muted-foreground">项目不存在或你无权查看该项目。</Card>
      )}

      {!loading && project && (
        <>
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
              <span className="text-sm text-foreground">{formatDateTime(project.createdAt)}</span>
            </Field>
          </Card>

          <Card className="p-6">
            <StageProgress project={project} />
          </Card>

          <StagePlanTable project={project} editable saving={savingStagePlans} onSave={handleSaveStagePlans} />

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="overflow-hidden">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold text-foreground">Doc 列表</h2>
              </div>
              <ul className="divide-y divide-border text-sm">
                {project.docSummary.map((item) => (
                  <li key={item.key} className="flex items-center justify-between px-4 py-3">
                    <span className="text-foreground">{item.title}</span>
                    <StatusBadge label={item.statusLabel} tone={item.tone} />
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold text-foreground">操作日志摘要</h2>
                <Button asChild size="sm" variant="ghost" className="h-8">
                  <Link href="/admin/audit">查看全部</Link>
                </Button>
              </div>
              <ul className="divide-y divide-border text-sm">
                {project.recentAuditLogs.length === 0 && (
                  <li className="px-4 py-6 text-center text-muted-foreground">暂无相关日志</li>
                )}
                {project.recentAuditLogs.map((log) => (
                  <li key={log.id} className="flex flex-col gap-1 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">{log.action}</span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(log.time)}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {log.operator}：{log.before} → {log.after}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">治理操作</h2>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="bg-transparent" onClick={() => openAction("editor")}>
                <UserCog className="mr-1.5 size-4" />
                调整负责编辑
              </Button>
              <Button variant="outline" className="bg-transparent" onClick={() => openAction("author")}>
                <UserCog className="mr-1.5 size-4" />
                调整负责作者
              </Button>
              <Button
                variant="outline"
                className="bg-transparent"
                disabled={!canComplete}
                onClick={() => openAction("complete")}
              >
                <CheckCircle2 className="mr-1.5 size-4" />
                标记完成
              </Button>
              {project.lifecycle === "cancelled" || project.lifecycle === "archived" ? (
                <Button variant="outline" className="bg-transparent" onClick={() => openAction("restore")}>
                  <RotateCcw className="mr-1.5 size-4" />
                  恢复
                </Button>
              ) : (
                <>
                  <Button variant="outline" className="bg-transparent" onClick={() => openAction("archive")}>
                    <Archive className="mr-1.5 size-4" />
                    归档
                  </Button>
                  <Button
                    variant="outline"
                    className="bg-transparent text-red-600 hover:text-red-600"
                    onClick={() => openAction("cancel")}
                  >
                    <XCircle className="mr-1.5 size-4" />
                    取消
                  </Button>
                </>
              )}
              <Button
                variant="outline"
                className="bg-transparent"
                disabled={project.qcStatus !== "approved" || submitting}
                onClick={() => void handleDownloadFinal()}
              >
                <Download className="mr-1.5 size-4" />
                下载终稿
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">所有治理动作都会记录到操作日志。</p>
          </Card>
        </>
      )}

      <Dialog open={action !== null} onOpenChange={(open) => !open && setAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action ? confirmTexts[action].title : "治理操作"}</DialogTitle>
            <DialogDescription>{action ? confirmTexts[action].desc : "—"}</DialogDescription>
          </DialogHeader>

          {action === "editor" && (
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label>新的负责编辑</Label>
                <Select value={selectedEditorId} onValueChange={setSelectedEditorId}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择新的负责编辑" />
                  </SelectTrigger>
                  <SelectContent>
                    {editors.map((editor) => (
                      <SelectItem key={editor.id} value={editor.id}>
                        {editor.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="editor-reason">调整原因</Label>
                <Textarea
                  id="editor-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="可选填写本次治理调整原因"
                  rows={3}
                />
              </div>
            </div>
          )}

          {action === "author" && (
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label>新的负责作者</Label>
                <Select value={selectedAuthorId} onValueChange={setSelectedAuthorId}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择新的负责作者" />
                  </SelectTrigger>
                  <SelectContent>
                    {authors.map((author) => (
                      <SelectItem key={author.id} value={author.id}>
                        {author.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="author-reason">调整原因</Label>
                <Textarea
                  id="author-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="可选填写本次治理调整原因"
                  rows={3}
                />
              </div>
            </div>
          )}

          {(action === "complete" || action === "archive" || action === "cancel" || action === "restore") && project && (
            <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              当前项目：<span className="font-medium text-foreground">{project.title}</span>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" className="bg-transparent" disabled={submitting} onClick={() => setAction(null)}>
              取消
            </Button>
            <Button
              className={action === "cancel" ? "bg-red-600 hover:bg-red-700" : ""}
              disabled={
                submitting ||
                (action === "editor" && !selectedEditorId) ||
                (action === "author" && !selectedAuthorId)
              }
              onClick={() =>
                void (action === "editor" || action === "author" ? handleSaveAssignment() : handleTransition())
              }
            >
              {submitting ? "处理中..." : "确认"}
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
