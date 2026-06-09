"use client"

import Link from "next/link"
import { notFound } from "next/navigation"
import { use } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { useRole } from "@/components/role-provider"
import { getProjectById, QC_STATUS_LABELS, QC_STATUS_TONE } from "@/lib/project-data"
import { DOC_STATUS_LABELS } from "@/lib/types"
import { Unlock, FileText, CheckCircle2, Info, Lock, ArrowRight } from "lucide-react"

export default function QcPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const project = getProjectById(id)
  const { role } = useRole()
  if (!project) notFound()

  const unapprovedChapters = project.chapters.filter((c) => !c.approved)
  const allApproved = project.totalChapters > 0 && project.approvedChapters === project.totalChapters
  const canUnlock = role === "editor" && project.qcStatus === "locked" && allApproved
  const canComplete = (role === "editor" || role === "admin") && project.qcStatus === "approved"

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["我的项目", project.title, "全文质检"]}
        title="全文质检"
        description={`${project.title} 的全文质检状态与解锁条件`}
      />

      {/* 状态卡片 */}
      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">全文质检状态</span>
          <div className="flex items-center gap-2">
            <StatusBadge label={QC_STATUS_LABELS[project.qcStatus]} tone={QC_STATUS_TONE[project.qcStatus]} />
            {project.qcStatus === "locked" && <span className="text-sm text-muted-foreground">尚未解锁</span>}
          </div>
        </div>
        {project.qcStatus !== "locked" && (
          <Button asChild variant="outline" className="bg-transparent">
            <Link href={`/projects/${project.id}/docs/qc`}>
              <FileText className="mr-1.5 size-4" />
              进入全文质检 Doc
              <ArrowRight className="ml-1 size-3.5" />
            </Link>
          </Button>
        )}
      </Card>

      {/* 解锁条件 */}
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
              {unapprovedChapters.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-sm">
                  <span className="text-foreground">{c.title}</span>
                  <StatusBadge label={DOC_STATUS_LABELS[c.status]} tone="warning" />
                </li>
              ))}
            </ul>
          </div>
        )}

        {role === "editor" && (
          <div className="mt-5">
            {canUnlock ? (
              <Button>
                <Unlock className="mr-1.5 size-4" />
                手动解锁全文质检
              </Button>
            ) : (
              <Button disabled variant="outline" className="bg-transparent">
                <Lock className="mr-1.5 size-4" />
                {project.qcStatus !== "locked" ? "全文质检已解锁" : "全部正文 Doc 通过后可解锁"}
              </Button>
            )}
          </div>
        )}
      </Card>

      {/* 说明提示 */}
      <Card className="flex gap-3 bg-muted/40 p-4 text-sm text-muted-foreground">
        <Info className="size-4 shrink-0 text-foreground" />
        <ul className="flex flex-col gap-1.5">
          <li>初始内容来自已通过正文 Doc。</li>
          <li>解锁后修改不回写单章。</li>
          <li>终稿导出优先取全文质检 Doc。</li>
        </ul>
      </Card>

      {/* 项目完成 */}
      {canComplete && (
        <Card className="flex items-center justify-between p-4">
          <span className="text-sm text-foreground">全文质检已通过，可标记项目完成。</span>
          <Button>
            <CheckCircle2 className="mr-1.5 size-4" />
            标记项目完成
          </Button>
        </Card>
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
