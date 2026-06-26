import { notFound } from "next/navigation"
import Link from "next/link"

import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { getSiPreissue } from "@/server/modules/si/si.service"
import { ApiError } from "@/server/shared/api-response"
import { requireServerCurrentUser } from "@/server/shared/current-user"
import { formatDateOnly } from "@/lib/utils"
import { getServerT } from "@/lib/i18n/server"
import { PRERELEASE_STATUS_LABEL_KEYS, PRERELEASE_STATUS_TONE } from "@/types/si"
import { PROJECT_STAGE_LABEL_KEYS, type ProjectStage } from "@/types/domain"
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
  const actor = await requireServerCurrentUser()
  const t = await getServerT()

  try {
    // 作者详情页只读取当前作者可见的预发记录；已收回记录在服务层已经被 404 隐藏。
    const { record: si } = await getSiPreissue(actor, recordId)
    const projectStage = si.projectStage as ProjectStage | undefined
    // 预发详情里的项目阶段来自数据库枚举；只有命中系统阶段字典时才翻译，未知值按兜底梗概展示。
    const projectStageLabel =
      projectStage && projectStage in PROJECT_STAGE_LABEL_KEYS
        ? t(PROJECT_STAGE_LABEL_KEYS[projectStage])
        : t("mySi.detail.defaultProjectStage")

    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          breadcrumb={[t("mySi.title"), si.title]}
          breadcrumbAriaLabel={t("common.breadcrumbs")}
          title={si.title}
          description={t("mySi.detail.description", {
            date: formatDateOnly(si.prereleasedAt),
            editorName: si.editorName,
          })}
          actions={
            <Button asChild variant="outline" className="bg-transparent">
              <Link href="/my-si">
                <ChevronLeft className="mr-1 size-4" />
                {t("mySi.detail.backToList")}
              </Link>
            </Button>
          }
        />

        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label={t(PRERELEASE_STATUS_LABEL_KEYS[si.status])} tone={PRERELEASE_STATUS_TONE[si.status]} />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="flex flex-col gap-5 p-5 lg:col-span-2">
            <h2 className="text-sm font-semibold text-foreground">{t("mySi.detail.content")}</h2>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t("mySi.detail.mainType")} value={si.mainType} />
              <Field label={t("mySi.detail.trope")} value={si.trope} />
              <Field label={t("mySi.detail.remark")} value={si.remark} />
            </div>
            <Separator />
            <Field label={t("mySi.detail.freshTwist")} value={si.freshTwist} />
            <Field label={t("mySi.detail.synopsis")} value={si.synopsis} />
            <Separator />
            <Field label={t("mySi.noteLabel")} value={si.note} />
          </Card>

          <div className="flex flex-col gap-6">
            <Card className="flex flex-col gap-4 p-5">
              <h2 className="text-sm font-semibold text-foreground">{t("mySi.detail.prereleaseInfo")}</h2>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t("mySi.editorLabel")}</span>
                <span className="text-foreground">{si.editorName}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t("mySi.prereleasedAtLabel")}</span>
                <span className="text-foreground">{formatDateOnly(si.prereleasedAt)}</span>
              </div>
            </Card>

            {si.status === "converted" ? (
              <Card className="flex flex-col gap-4 p-5">
                <h2 className="text-sm font-semibold text-foreground">{t("mySi.detail.convertedInfo")}</h2>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t("mySi.detail.projectName")}</span>
                  <span className="text-foreground">{si.projectName}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t("mySi.detail.currentStage")}</span>
                  <StatusBadge label={projectStageLabel} tone="info" />
                </div>
                {si.projectId && (
                  <Button asChild>
                    <Link href={`/projects/${si.projectId}`}>
                      <ExternalLink className="mr-1 size-4" />
                      {t("mySi.enterProject")}
                    </Link>
                  </Button>
                )}
              </Card>
            ) : (
              <Card className="flex flex-col items-center gap-2 p-6 text-center">
                <Clock className="size-8 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">{t("mySi.detail.waitingTitle")}</p>
                <p className="text-xs text-muted-foreground">{t("mySi.detail.waitingDescription")}</p>
              </Card>
            )}
          </div>
        </div>
      </div>
    )
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound()
    }

    throw error
  }
}
