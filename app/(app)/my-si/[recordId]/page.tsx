import { notFound } from "next/navigation"
import Link from "next/link"
import { PageHeader } from "@/components/page-header"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { StatusBadge } from "@/components/status-badge"
import {
  getMySiByRecord,
  PRERELEASE_STATUS_LABELS,
  PRERELEASE_STATUS_TONE,
} from "@/lib/si-data"
import { ChevronLeft, ExternalLink, Clock } from "lucide-react"

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm leading-relaxed text-foreground">{value || "—"}</p>
    </div>
  )
}

export default async function MySiDetailPage({ params }: { params: Promise<{ recordId: string }> }) {
  const { recordId } = await params
  const si = getMySiByRecord(recordId)
  if (!si) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["我的 SI", si.title]}
        title={si.title}
        description={`预发编辑：${si.editorName} · 预发于 ${si.prereleasedAt}`}
        actions={
          <Button asChild variant="outline" className="bg-transparent">
            <Link href="/my-si">
              <ChevronLeft className="mr-1 size-4" />
              返回我的 SI
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge label={PRERELEASE_STATUS_LABELS[si.status]} tone={PRERELEASE_STATUS_TONE[si.status]} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* SI 内容（只读） */}
        <Card className="flex flex-col gap-5 p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-foreground">选题内容</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="主类型" value={si.mainType} />
            <Field label="Trope" value={si.trope} />
            <Field label="对标书目" value={si.benchmark} />
            <Field label="备注" value={si.remark} />
          </div>
          <Separator />
          <Field label="Fresh Twist" value={si.freshTwist} />
          <Field label="核心故事梗概" value={si.synopsis} />
          <Separator />
          <Field label="预发说明" value={si.note} />
        </Card>

        {/* 侧栏：转项目信息 */}
        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-4 p-5">
            <h2 className="text-sm font-semibold text-foreground">预发信息</h2>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">预发编辑</span>
              <span className="text-foreground">{si.editorName}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">预发时间</span>
              <span className="text-foreground">{si.prereleasedAt}</span>
            </div>
          </Card>

          {si.status === "converted" ? (
            <Card className="flex flex-col gap-4 p-5">
              <h2 className="text-sm font-semibold text-foreground">转项目信息</h2>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">项目名称</span>
                <span className="text-foreground">{si.projectName}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">当前阶段</span>
                <StatusBadge label={si.projectStage ?? "梗概"} tone="info" />
              </div>
              <Button asChild>
                <Link href={`/projects/${si.projectId}`}>
                  <ExternalLink className="mr-1 size-4" />
                  进入项目
                </Link>
              </Button>
            </Card>
          ) : (
            <Card className="flex flex-col items-center gap-2 p-6 text-center">
              <Clock className="size-8 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">等待编辑确认转项目</p>
              <p className="text-xs text-muted-foreground">
                编辑确认转项目后，这里将出现进入项目的入口
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
