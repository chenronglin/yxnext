"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { PageHeader } from "@/components/page-header"
import { PrereleaseDialog } from "@/components/si/prerelease-dialog"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { useConfirmDialog, useToast } from "@/components/ui/app-feedback"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { fetchJson } from "@/lib/api"
import { formatDateOnly } from "@/lib/utils"
import { SI_STATUS_LABELS } from "@/types/domain"
import {
  PRERELEASE_STATUS_LABELS,
  PRERELEASE_STATUS_TONE,
  SI_STATUS_TONE,
  type PrereleaseRecord,
  type SiItem,
} from "@/types/si"
import {
  Archive,
  ArrowRightCircle,
  ChevronLeft,
  ExternalLink,
  History,
  Lock,
  Pencil,
  Send,
  Trash2,
  Undo2,
} from "lucide-react"

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value || "—"}</p>
    </div>
  )
}

type ConvertProjectResponse = {
  project: {
    projectId: string
  }
}

export function SiDetail({ si }: { si: SiItem }) {
  const router = useRouter()
  const confirm = useConfirmDialog()
  const toast = useToast()
  const [prereleaseOpen, setPrereleaseOpen] = useState(false)
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null)
  const [pendingRecordId, setPendingRecordId] = useState<string | null>(null)
  const [workingAction, setWorkingAction] = useState<"archive" | "delete" | null>(null)

  const records = si.preissues
  const convertedRecord = records.find((record) => record.status === "converted")
  const editable = si.status === "draft" || si.status === "prereleased"

  async function handleWithdraw(record: PrereleaseRecord) {
    if (pendingRecordId) return

    const confirmed = await confirm({
      title: "确认收回预发",
      description: `收回后，作者「${record.authorName}」端将不再显示《${record.siTitle}》的预发记录。`,
      confirmText: "确认收回",
    })
    if (!confirmed) return

    setPendingRecordId(record.recordId)
    setMessage(null)

    try {
      // 收回后直接刷新服务端详情，确保 SI 状态和记录列表一起回流，而不是手工拼本地状态。
      await fetchJson(`/api/si-prepublish/${record.recordId}/withdraw`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      })

      setMessage({
        type: "success",
        text: "预发记录已收回",
      })
      toast({ type: "success", title: "预发记录已收回" })
      router.refresh()
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "收回失败，请稍后重试",
      })
    } finally {
      setPendingRecordId(null)
    }
  }

  async function handleConvert(record: PrereleaseRecord) {
    if (pendingRecordId) return

    const confirmed = await confirm({
      title: "确认转项目",
      description: `将基于《${record.siTitle}》与作者「${record.authorName}」创建新项目，并进入梗概阶段。`,
      confirmText: "确认转项目",
    })
    if (!confirmed) return

    setPendingRecordId(record.recordId)
    setMessage(null)

    try {
      // 转项目成功后进入新项目页；项目、阶段计划和梗概 Doc 的创建都由后端事务完成。
      const response = await fetchJson<ConvertProjectResponse>(
        `/api/si-prepublish/${record.recordId}/convert-to-project`,
        {
          method: "POST",
        },
      )

      router.push(`/projects/${response.project.projectId}`)
      router.refresh()
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "转项目失败，请稍后重试",
      })
    } finally {
      setPendingRecordId(null)
    }
  }

  async function handleArchive() {
    if (workingAction) return

    const confirmed = await confirm({
      title: "确认归档 SI",
      description: `归档后《${si.title}》将不可继续编辑或预发。`,
      confirmText: "确认归档",
    })

    if (!confirmed) return

    setWorkingAction("archive")

    try {
      await fetchJson(`/api/si/${si.id}/archive`, { method: "POST" })
      toast({ type: "success", title: "SI 已归档" })
      router.refresh()
    } catch (error) {
      toast({ type: "error", title: error instanceof Error ? error.message : "归档失败，请稍后重试" })
    } finally {
      setWorkingAction(null)
    }
  }

  async function handleDelete() {
    if (workingAction) return

    const confirmed = await confirm({
      title: "确认删除 SI",
      description: `删除《${si.title}》会同步收回活动预发、关闭待办并通知作者。该操作不可恢复。`,
      confirmText: "确认删除",
      tone: "danger",
    })

    if (!confirmed) return

    setWorkingAction("delete")

    try {
      await fetchJson(`/api/si/${si.id}`, { method: "DELETE" })
      toast({ type: "success", title: "SI 已删除" })
      router.push("/si")
      router.refresh()
    } catch (error) {
      toast({ type: "error", title: error instanceof Error ? error.message : "删除失败，请稍后重试" })
    } finally {
      setWorkingAction(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["SI 选题策划库", si.title]}
        title={si.title}
        description={`创建编辑：${si.createdBy} · 创建于 ${formatDateOnly(si.createdAt)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {editable ? (
              <Button asChild variant="outline" className="bg-transparent">
                <Link href={`/si/${si.id}/edit`}>
                  <Pencil className="mr-1 size-4" />
                  编辑
                </Link>
              </Button>
            ) : (
              <Button variant="outline" className="bg-transparent text-muted-foreground" disabled>
                <Pencil className="mr-1 size-4" />
                编辑
              </Button>
            )}
            <Button onClick={() => setPrereleaseOpen(true)} disabled={si.status === "archived" || si.converted}>
              <Send className="mr-1 size-4" />
              预发
            </Button>
          </div>
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

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge label={SI_STATUS_LABELS[si.status]} tone={SI_STATUS_TONE[si.status]} />
        {si.converted && <StatusBadge label="已转项目" tone="success" />}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card className="flex flex-col gap-5 p-5">
            <h2 className="text-sm font-semibold text-foreground">基础信息</h2>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="主类型" value={si.mainType} />
              <Field label="Trope" value={si.trope} />
              <Field label="适配作者" value={si.authors.join("、")} />
            </div>
            <Field label="备注" value={si.remark} />
            <Separator />
            <Field label="Fresh Twist" value={si.freshTwist} />
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">核心故事梗概</p>
              <p className="text-sm leading-relaxed text-foreground">{si.synopsis}</p>
            </div>
          </Card>

          <Card className="flex flex-col gap-4 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">预发记录</h2>
              <span className="text-xs text-muted-foreground">{records.length} 条</span>
            </div>
            {records.length === 0 && <p className="text-sm text-muted-foreground">暂无预发记录</p>}
            <div className="flex flex-col gap-3">
              {/* 详情页展示全部记录状态，已收回记录保留给编辑追溯；作者端隐藏逻辑由作者接口单独处理。 */}
              {records.map((record) => (
                <div
                  key={record.recordId}
                  className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{record.authorName}</span>
                      <StatusBadge
                        label={PRERELEASE_STATUS_LABELS[record.status]}
                        tone={PRERELEASE_STATUS_TONE[record.status]}
                      />
                      {record.projectName && (
                        <StatusBadge label={`关联项目：${record.projectName}`} tone="info" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">预发说明：{record.note || "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      预发时间：{formatDateOnly(record.prereleasedAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {record.status === "active" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="bg-transparent"
                          disabled={pendingRecordId === record.recordId}
                          onClick={() => void handleWithdraw(record)}
                        >
                          <Undo2 className="mr-1 size-3.5" />
                          {pendingRecordId === record.recordId ? "处理中..." : "收回"}
                        </Button>
                        <Button
                          size="sm"
                          disabled={pendingRecordId === record.recordId}
                          onClick={() => void handleConvert(record)}
                        >
                          <ArrowRightCircle className="mr-1 size-3.5" />
                          {pendingRecordId === record.recordId ? "处理中..." : "确认转项目"}
                        </Button>
                      </>
                    )}
                    {record.status === "converted" && record.projectId && (
                      <Button asChild size="sm" variant="outline" className="bg-transparent">
                        <Link href={`/projects/${record.projectId}`}>
                          <ExternalLink className="mr-1 size-3.5" />
                          进入项目
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-4 p-5">
            <h2 className="text-sm font-semibold text-foreground">创建信息</h2>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">创建编辑</span>
              <span className="text-foreground">{si.createdBy}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">创建时间</span>
              <span className="text-foreground">{formatDateOnly(si.createdAt)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">最近更新</span>
              <span className="text-foreground">{formatDateOnly(si.updatedAt)}</span>
            </div>
          </Card>

          {convertedRecord?.projectId && (
            <Card className="flex flex-col gap-3 p-5">
              <h2 className="text-sm font-semibold text-foreground">关联项目</h2>
              <p className="text-sm text-muted-foreground">该 SI 已转项目，可直接进入项目跟进。</p>
              <Button asChild variant="outline" className="bg-transparent">
                <Link href={`/projects/${convertedRecord.projectId}`}>
                  <ExternalLink className="mr-1 size-4" />
                  进入关联项目
                </Link>
              </Button>
            </Card>
          )}

          <Card className="flex flex-col gap-2 p-5">
            <h2 className="mb-1 text-sm font-semibold text-foreground">更多操作</h2>
            <Button asChild variant="outline" className="justify-start bg-transparent">
              <Link href={`/si/${si.id}/versions`}>
                <History className="mr-2 size-4" />
                查看版本历史
              </Link>
            </Button>
            <Button
              variant="outline"
              className="justify-start bg-transparent"
              disabled={si.status === "archived" || si.converted || Boolean(workingAction)}
              onClick={() => void handleArchive()}
            >
              <Archive className="mr-2 size-4" />
              {workingAction === "archive" ? "归档中..." : "归档"}
            </Button>
            {si.converted ? (
              <Button variant="outline" className="justify-start bg-transparent text-muted-foreground" disabled>
                <Lock className="mr-2 size-4" />
                已转项目，不可删除
              </Button>
            ) : (
              <Button
                variant="outline"
                className="justify-start bg-transparent"
                disabled={Boolean(workingAction)}
                onClick={() => void handleDelete()}
              >
                <Trash2 className="mr-2 size-4" />
                {workingAction === "delete" ? "删除中..." : "删除"}
              </Button>
            )}
            <Button variant="ghost" className="justify-start" onClick={() => router.push("/si")}>
              <ChevronLeft className="mr-2 size-4" />
              返回列表
            </Button>
          </Card>
        </div>
      </div>

      <PrereleaseDialog
        open={prereleaseOpen}
        onOpenChange={setPrereleaseOpen}
        si={si}
        prereleasedAuthorIds={records.filter((record) => record.status === "active").map((record) => record.authorId)}
        onSubmitted={() => {
          setMessage({
            type: "success",
            text: "SI 已预发",
          })
          toast({ type: "success", title: "SI 已预发" })
          router.refresh()
        }}
      />
    </div>
  )
}
