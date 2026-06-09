"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { PageHeader } from "@/components/page-header"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { StatusBadge } from "@/components/status-badge"
import { PrereleaseDialog } from "@/components/si/prerelease-dialog"
import {
  SI_STATUS_TONE,
  PRERELEASE_RECORDS,
  PRERELEASE_STATUS_LABELS,
  PRERELEASE_STATUS_TONE,
  BOUND_AUTHORS,
  type SiItem,
} from "@/mocks/si-data"
import { SI_STATUS_LABELS } from "@/types/domain"
import {
  Pencil,
  Send,
  History,
  Trash2,
  Archive,
  ChevronLeft,
  Undo2,
  ArrowRightCircle,
  ExternalLink,
  Lock,
} from "lucide-react"

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value || "—"}</p>
    </div>
  )
}

export function SiDetail({ si }: { si: SiItem }) {
  const router = useRouter()
  const [prereleaseOpen, setPrereleaseOpen] = useState(false)
  const records = PRERELEASE_RECORDS.filter((r) => r.siId === si.id && r.status !== "withdrawn")
  const prereleasedAuthorIds = records.filter((r) => r.status === "active").map((r) => r.authorId)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["SI 选题策划库", si.title]}
        title={si.title}
        description={`创建编辑：${si.createdBy} · 创建于 ${si.createdAt}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" className="bg-transparent">
              <Link href={`/si/${si.id}/edit`}>
                <Pencil className="mr-1 size-4" />
                编辑
              </Link>
            </Button>
            <Button onClick={() => setPrereleaseOpen(true)} disabled={si.status === "archived"}>
              <Send className="mr-1 size-4" />
              预发
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge label={SI_STATUS_LABELS[si.status]} tone={SI_STATUS_TONE[si.status]} />
        {si.converted && <StatusBadge label="已转项目" tone="success" />}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* 基础信息卡片 */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card className="flex flex-col gap-5 p-5">
            <h2 className="text-sm font-semibold text-foreground">基础信息</h2>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="主类型" value={si.mainType} />
              <Field label="Trope" value={si.trope} />
              <Field label="对标书目" value={si.benchmark} />
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

          {/* 预发记录区 */}
          <Card className="flex flex-col gap-4 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">预发记录</h2>
              <span className="text-xs text-muted-foreground">{records.length} 条</span>
            </div>
            {records.length === 0 && <p className="text-sm text-muted-foreground">暂无预发记录</p>}
            <div className="flex flex-col gap-3">
              {records.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{r.authorName}</span>
                      <StatusBadge
                        label={PRERELEASE_STATUS_LABELS[r.status]}
                        tone={PRERELEASE_STATUS_TONE[r.status]}
                      />
                      {r.projectName && <StatusBadge label={`关联项目：${r.projectName}`} tone="info" />}
                    </div>
                    <p className="text-xs text-muted-foreground">预发说明：{r.note}</p>
                    <p className="text-xs text-muted-foreground">预发时间：{r.prereleasedAt}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {r.status === "active" && (
                      <>
                        <Button size="sm" variant="outline" className="bg-transparent">
                          <Undo2 className="mr-1 size-3.5" />
                          收回
                        </Button>
                        <Button size="sm">
                          <ArrowRightCircle className="mr-1 size-3.5" />
                          确认转项目
                        </Button>
                      </>
                    )}
                    {r.status === "converted" && (
                      <Button asChild size="sm" variant="outline" className="bg-transparent">
                        <Link href={`/projects/${r.projectId}`}>
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

        {/* 侧栏：创建信息 + 操作 */}
        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-4 p-5">
            <h2 className="text-sm font-semibold text-foreground">创建信息</h2>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">创建编辑</span>
              <span className="text-foreground">{si.createdBy}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">创建时间</span>
              <span className="text-foreground">{si.createdAt}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">最近更新</span>
              <span className="text-foreground">{si.updatedAt}</span>
            </div>
          </Card>

          {si.converted && (
            <Card className="flex flex-col gap-3 p-5">
              <h2 className="text-sm font-semibold text-foreground">关联项目</h2>
              <p className="text-sm text-muted-foreground">该 SI 已转项目，可直接进入项目跟进。</p>
              <Button asChild variant="outline" className="bg-transparent">
                <Link href="/projects">
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
            <Button variant="outline" className="justify-start bg-transparent">
              <Archive className="mr-2 size-4" />
              归档
            </Button>
            {si.converted ? (
              <Button variant="outline" className="justify-start bg-transparent text-muted-foreground" disabled>
                <Lock className="mr-2 size-4" />
                已转项目，不可删除
              </Button>
            ) : (
              <Button variant="outline" className="justify-start bg-transparent text-red-600 hover:text-red-600">
                <Trash2 className="mr-2 size-4" />
                删除
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
        prereleasedAuthorIds={prereleasedAuthorIds.map(
          (id) => BOUND_AUTHORS.find((a) => a.id === id)?.id ?? id,
        )}
      />
    </div>
  )
}
