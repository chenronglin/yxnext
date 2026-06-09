"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { PageHeader } from "@/components/page-header"
import { PrereleaseDialog } from "@/components/si/prerelease-dialog"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { fetchJson } from "@/lib/api"
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
  const [prereleaseOpen, setPrereleaseOpen] = useState(false)
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null)
  const [pendingRecordId, setPendingRecordId] = useState<string | null>(null)

  const records = si.preissues
  const convertedRecord = records.find((record) => record.status === "converted")
  const editable = si.status === "draft" || si.status === "prereleased"

  async function handleWithdraw(record: PrereleaseRecord) {
    if (pendingRecordId) return

    const confirmed = window.confirm(`确认收回作者「${record.authorName}」的预发记录吗？`)
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

    const confirmed = window.confirm(`确认基于《${record.siTitle}》和作者「${record.authorName}」创建项目吗？`)
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["SI 选题策划库", si.title]}
        title={si.title}
        description={`创建编辑：${si.createdBy} · 创建于 ${new Date(si.createdAt).toLocaleString("zh-CN")}`}
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
                      预发时间：{new Date(record.prereleasedAt).toLocaleString("zh-CN")}
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
              <span className="text-foreground">{new Date(si.createdAt).toLocaleString("zh-CN")}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">最近更新</span>
              <span className="text-foreground">{new Date(si.updatedAt).toLocaleString("zh-CN")}</span>
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
            {/* 归档/删除不属于第 3 批，保留入口但明确禁用，避免形成假交互。 */}
            <Button variant="outline" className="justify-start bg-transparent text-muted-foreground" disabled>
              <Archive className="mr-2 size-4" />
              归档（后续批次）
            </Button>
            {si.converted ? (
              <Button variant="outline" className="justify-start bg-transparent text-muted-foreground" disabled>
                <Lock className="mr-2 size-4" />
                已转项目，不可删除
              </Button>
            ) : (
              <Button variant="outline" className="justify-start bg-transparent text-muted-foreground" disabled>
                <Trash2 className="mr-2 size-4" />
                删除（后续批次）
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
          router.refresh()
        }}
      />
    </div>
  )
}
