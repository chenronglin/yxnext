"use client"

import { useState } from "react"
import Link from "next/link"
import { PageHeader } from "@/components/page-header"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { StatusBadge } from "@/components/status-badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { SI_VERSIONS, type SiVersion, type SiItem } from "@/lib/si-data"
import { ChevronLeft, Eye, Undo2, AlertTriangle } from "lucide-react"

function PreviewField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm leading-relaxed text-foreground">{value || "—"}</p>
    </div>
  )
}

export function SiVersions({ si }: { si: SiItem }) {
  const [activeVersion, setActiveVersion] = useState<SiVersion>(
    SI_VERSIONS.find((v) => v.current) ?? SI_VERSIONS[0],
  )
  const [rollbackTarget, setRollbackTarget] = useState<SiVersion | null>(null)

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

      <div className="grid gap-6 lg:grid-cols-3">
        {/* 版本列表 */}
        <div className="flex flex-col gap-3 lg:col-span-1">
          {SI_VERSIONS.map((v) => {
            const isActive = v.version === activeVersion.version
            return (
              <Card
                key={v.version}
                className={cn(
                  "cursor-pointer p-4 transition-colors",
                  isActive ? "border-primary ring-1 ring-primary/30" : "hover:border-primary/40",
                )}
                onClick={() => setActiveVersion(v)}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">版本 V{v.version}</span>
                  {v.current && <StatusBadge label="当前版本" tone="success" />}
                </div>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <p>保存人：{v.savedBy}</p>
                  <p>保存时间：{v.savedAt}</p>
                  {v.note && <p>说明：{v.note}</p>}
                </div>
              </Card>
            )
          })}
        </div>

        {/* 版本详情预览 */}
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
              <Button
                size="sm"
                disabled={activeVersion.current}
                onClick={() => setRollbackTarget(activeVersion)}
              >
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
      </div>

      {/* 回退二次确认 */}
      <Dialog open={!!rollbackTarget} onOpenChange={(o) => !o && setRollbackTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-500" />
              确认回退版本
            </DialogTitle>
            <DialogDescription>
              将把 SI 内容回退到 V{rollbackTarget?.version} 的快照，并生成新的当前版本。此操作不可直接撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="bg-transparent" onClick={() => setRollbackTarget(null)}>
              取消
            </Button>
            <Button onClick={() => setRollbackTarget(null)}>确认回退</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
