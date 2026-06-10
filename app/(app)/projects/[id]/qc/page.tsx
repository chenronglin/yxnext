"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { use } from "react"

import { PageHeader } from "@/components/page-header"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/status-badge"
import { useRole } from "@/components/role-provider"
import { fetchJson } from "@/lib/api"
import { DOC_STATUS_LABELS } from "@/types/domain"
import { RELEASE_DOC_STATUS_LABELS, RELEASE_DOC_STATUS_TONE, type ProjectDetail } from "@/types/project"
import { Unlock, FileText, CheckCircle2, Info, Lock, ArrowRight } from "lucide-react"

type ProjectDetailResponse = {
  project: ProjectDetail
}

export default function QcPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { role } = useRole()
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null)
  const [workingAction, setWorkingAction] = useState<null | "unlock" | "complete">(null)

  async function loadProject(successText?: string) {
    setLoading(true)

    try {
      const response = await fetchJson<ProjectDetailResponse>(`/api/projects/${id}`)
      setProject(response.project)

      if (successText) {
        setMessage({
          type: "success",
          text: successText,
        })
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "质检信息读取失败",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadProject()
  }, [id])

  async function handleUnlock() {
    setWorkingAction("unlock")
    setMessage(null)

    try {
      await fetchJson(`/api/projects/${id}/qc/unlock`, {
        method: "POST",
      })
      await loadProject("质检已解锁")
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "质检解锁失败",
      })
    } finally {
      setWorkingAction(null)
    }
  }

  async function handleComplete() {
    setWorkingAction("complete")
    setMessage(null)

    try {
      await fetchJson(`/api/projects/${id}/complete`, {
        method: "POST",
      })
      await loadProject("项目已标记完成")
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "项目完成失败",
      })
    } finally {
      setWorkingAction(null)
    }
  }

  const unapprovedChapters = project?.chapters.filter((item) => !item.approved) ?? []
  const allApproved = Boolean(project && project.totalChapters > 0 && project.approvedChapters === project.totalChapters)
  const canUnlock = role === "editor" || role === "admin"
  const canComplete = Boolean(project && project.releaseDocStatus === "approved" && (role === "editor" || role === "admin"))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["我的项目", project?.title ?? "质检", "质检"]}
        title="质检"
        description={project ? `${project.title} 的质检状态与解锁条件` : "正在加载质检信息"}
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

      {loading ? (
        <Card className="px-4 py-10 text-center text-sm text-muted-foreground">正在加载质检状态...</Card>
      ) : project ? (
        <>
          <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">质检状态</span>
              <div className="flex items-center gap-2">
                <StatusBadge
                  label={RELEASE_DOC_STATUS_LABELS[project.releaseDocStatus]}
                  tone={RELEASE_DOC_STATUS_TONE[project.releaseDocStatus]}
                />
                {project.releaseDocStatus === "locked" && <span className="text-sm text-muted-foreground">尚未解锁</span>}
              </div>
            </div>
            {project.docDirectory.releaseDocId && project.releaseDocStatus !== "locked" && (
              <Button asChild variant="outline" className="bg-transparent">
                <Link href={`/projects/${project.id}/docs/${project.docDirectory.releaseDocId}`}>
                  <FileText className="mr-1.5 size-4" />
                  进入质检 Doc
                  <ArrowRight className="ml-1 size-3.5" />
                </Link>
              </Button>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold text-foreground">解锁条件</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Stat label="正文总章节数" value={String(project.totalChapters)} />
              <Stat label="已通过章节数" value={String(project.approvedChapters)} tone="success" />
              <Stat label="未通过章节数" value={String(unapprovedChapters.length)} tone={unapprovedChapters.length > 0 ? "warning" : "success"} />
            </div>

            {unapprovedChapters.length > 0 && (
              <div className="mt-4">
                <span className="text-xs text-muted-foreground">未通过章节列表</span>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {unapprovedChapters.map((chapter) => (
                    <li key={chapter.id} className="flex items-center gap-2 text-sm">
                      <span className="text-foreground">{chapter.title}</span>
                      <StatusBadge label={DOC_STATUS_LABELS[chapter.status]} tone="warning" />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {canUnlock && (
              <div className="mt-5">
                <Button
                  disabled={!allApproved || project.releaseDocStatus !== "locked" || workingAction === "unlock"}
                  variant={allApproved && project.releaseDocStatus === "locked" ? "default" : "outline"}
                  className={allApproved && project.releaseDocStatus === "locked" ? "" : "bg-transparent"}
                  onClick={() => void handleUnlock()}
                >
                  {allApproved && project.releaseDocStatus === "locked" ? (
                    <Unlock className="mr-1.5 size-4" />
                  ) : (
                    <Lock className="mr-1.5 size-4" />
                  )}
                  {workingAction === "unlock"
                    ? "解锁中..."
                    : project.releaseDocStatus !== "locked"
                      ? "质检已解锁"
                      : "手动解锁质检"}
                </Button>
              </div>
            )}
          </Card>

          <Card className="flex gap-3 bg-muted/40 p-4 text-sm text-muted-foreground">
            <Info className="size-4 shrink-0 text-foreground" />
            <ul className="flex flex-col gap-1.5">
              <li>初始内容来自全部已通过的正文章节 Revision。</li>
              <li>解锁后修改只作用于质检 Doc，不会回写单章。</li>
              <li>终稿导出默认优先取质检 Doc。</li>
            </ul>
          </Card>

          {canComplete && (
            <Card className="flex items-center justify-between p-4">
              <span className="text-sm text-foreground">质检已通过，可标记项目完成。</span>
              <Button disabled={workingAction === "complete"} onClick={() => void handleComplete()}>
                <CheckCircle2 className="mr-1.5 size-4" />
                {workingAction === "complete" ? "处理中..." : "标记项目完成"}
              </Button>
            </Card>
          )}
        </>
      ) : (
        <Card className="px-4 py-10 text-center text-sm text-muted-foreground">项目不存在，或你无权访问当前质检页。</Card>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "success" | "warning" }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          "mt-1 text-2xl font-semibold " +
          (tone === "success" ? "text-emerald-600" : tone === "warning" ? "text-amber-600" : "text-foreground")
        }
      >
        {value}
      </p>
    </div>
  )
}
