"use client"

import Link from "next/link"
import { notFound } from "next/navigation"
import { use } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { useRole } from "@/components/role-provider"
import { getProjectById, DOC_STATUS_TONE } from "@/mocks/project-data"
import { DOC_STATUS_LABELS, HOLDER_ROLE_LABELS, HolderRole } from "@/types/domain"
import { Plus, FileText, History, BookOpen, Trash2, ArrowUpDown, Lock } from "lucide-react"

export default function ChaptersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const project = getProjectById(id)
  const { role } = useRole()
  if (!project) notFound()

  const unlocked = !["synopsis", "outline"].includes(project.stage)
  const canEdit = (role === "author" || role === "editor") && project.lifecycle === "active"

  const holderTone = (holder: HolderRole) =>
    holder === "author" ? "info" : holder === "editor" ? "warning" : "neutral"

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["我的项目", project.title, "正文章节"]}
        title="正文章节管理"
        description={`${project.title} 的章节 Doc，支持并行提交、审核与推进`}
        actions={
          canEdit && unlocked ? (
            <Button>
              <Plus className="mr-1.5 size-4" />
              新增章节
            </Button>
          ) : undefined
        }
      />

      {!unlocked && (
        <Card className="flex items-center gap-3 border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <Lock className="size-4 shrink-0" />
          正文阶段尚未解锁，需细纲通过后才能提交章节审核。当前可保存草稿。
        </Card>
      )}

      {/* 章节进度概览 */}
      <Card className="flex flex-wrap items-center gap-x-8 gap-y-2 p-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">正文总章节</span>
          <span className="font-semibold text-foreground">{project.totalChapters}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">已通过章节</span>
          <span className="font-semibold text-emerald-600">{project.approvedChapters}</span>
        </div>
        {project.totalChapters > 0 && project.approvedChapters === project.totalChapters && (
          <StatusBadge label="可解锁全文质检" tone="success" />
        )}
      </Card>

      {/* 章节列表 */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">排序</th>
                <th className="px-4 py-3 font-medium">章节标题</th>
                <th className="px-4 py-3 font-medium">Doc 状态</th>
                <th className="px-4 py-3 font-medium">持有人</th>
                <th className="px-4 py-3 font-medium">字数</th>
                <th className="px-4 py-3 font-medium">最近提交说明</th>
                <th className="px-4 py-3 font-medium">最近操作</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {project.chapters.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    暂无章节，{canEdit ? "点击右上角“新增章节”开始创作" : "正文阶段解锁后将显示章节"}
                  </td>
                </tr>
              )}
              {project.chapters.map((ch) => (
                <tr key={ch.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 text-muted-foreground">{ch.order}</td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-foreground">{ch.title}</span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge label={DOC_STATUS_LABELS[ch.status]} tone={DOC_STATUS_TONE[ch.status]} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge label={HOLDER_ROLE_LABELS[ch.holder]} tone={holderTone(ch.holder)} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{ch.words.toLocaleString()}</td>
                  <td className="px-4 py-3 max-w-[200px] truncate text-muted-foreground" title={ch.lastNote}>
                    {ch.lastNote}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {ch.lastOperator}
                    <br />
                    {ch.lastOperatedAt}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button asChild size="sm" variant="ghost" className="h-8 px-2" title="进入当前稿件">
                        <Link href={`/projects/${project.id}/docs/manuscript`}>
                          <FileText className="size-3.5" />
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="ghost" className="h-8 px-2" title="历史版本">
                        <Link href={`/projects/${project.id}/docs/manuscript/versions`}>
                          <History className="size-3.5" />
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="ghost" className="h-8 px-2" title="阅读模式">
                        <Link href={`/projects/${project.id}/docs/manuscript/clean`}>
                          <BookOpen className="size-3.5" />
                        </Link>
                      </Button>
                      {canEdit && (
                        <Button size="sm" variant="ghost" className="h-8 px-2" title="调整排序">
                          <ArrowUpDown className="size-3.5" />
                        </Button>
                      )}
                      {canEdit && !ch.approved && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-red-600 hover:text-red-600"
                          title="删除章节"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
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
        <Link href={`/projects/${project.id}`} className="mx-1 text-primary hover:underline">
          项目详情
        </Link>
        查看阶段进度与其他 Doc。
      </p>
    </div>
  )
}
