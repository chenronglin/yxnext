"use client"

import { useState } from "react"
import Link from "next/link"

import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { cn, formatDateOnly } from "@/lib/utils"
import type { SiItem, SiVersion } from "@/types/si"
import { ChevronLeft, Eye, Undo2 } from "lucide-react"

function PreviewField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm leading-relaxed text-foreground">{value || "—"}</p>
    </div>
  )
}

export function SiVersions({ si, versions }: { si: SiItem; versions: SiVersion[] }) {
  const [activeVersion, setActiveVersion] = useState<SiVersion | null>(versions[0] ?? null)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["SI 选题策划库", si.title, "版本历史"]}
        title="SI 版本历史"
        description="选题策划每次保存形成的版本快照，仅用于选题追溯，与 Doc 历史快照（Revision）是两套概念"
        actions={
          <Button asChild variant="outline" className="bg-transparent">
            <Link href={`/si/${si.id}`}>
              <ChevronLeft className="mr-1 size-4" />
              返回 SI 详情
            </Link>
          </Button>
        }
      />

      {versions.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">暂无版本快照</Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-3 lg:col-span-1">
            {/* 版本列表按最新在前展示，点击左侧卡片即可切换右侧快照预览。 */}
            {versions.map((version) => {
              const isActive = version.id === activeVersion?.id

              return (
                <Card
                  key={version.id}
                  className={cn(
                    "cursor-pointer p-4 transition-colors",
                    isActive ? "border-primary ring-1 ring-primary/30" : "hover:border-primary/40",
                  )}
                  onClick={() => setActiveVersion(version)}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">版本 V{version.version}</span>
                    {version.current && <StatusBadge label="当前版本" tone="success" />}
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <p>保存人：{version.savedBy}</p>
                    <p>保存时间：{formatDateOnly(version.savedAt)}</p>
                    {version.note && <p>说明：{version.note}</p>}
                  </div>
                </Card>
              )
            })}
          </div>

          {activeVersion && (
            <Card className="flex flex-col gap-5 p-5 lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-foreground">版本 V{activeVersion.version} 预览</h2>
                  {activeVersion.current && <StatusBadge label="当前版本" tone="success" />}
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="bg-transparent" disabled>
                    <Eye className="mr-1 size-3.5" />
                    只读查看
                  </Button>
                  <Button size="sm" disabled title="回退能力不属于第 3 批">
                    {/* 第 3 批只要求读版本与转项目，不包含版本回退能力。 */}
                    <Undo2 className="mr-1 size-3.5" />
                    回退到此版本
                  </Button>
                </div>
              </div>
              <Separator />
              <div className="grid gap-5 sm:grid-cols-2">
                <PreviewField label="标题" value={activeVersion.title} />
                <PreviewField label="主类型" value={activeVersion.mainType} />
                <PreviewField label="Trope" value={activeVersion.trope} />
              </div>
              <PreviewField label="Fresh Twist" value={activeVersion.freshTwist} />
              <PreviewField label="核心故事梗概" value={activeVersion.synopsis} />
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
