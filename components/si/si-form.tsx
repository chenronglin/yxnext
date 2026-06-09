"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { PageHeader } from "@/components/page-header"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { StatusBadge } from "@/components/status-badge"
import { PrereleaseDialog } from "@/components/si/prerelease-dialog"
import { cn } from "@/lib/utils"
import { MAIN_TYPES, BOUND_AUTHORS, SI_STATUS_TONE, type SiItem } from "@/lib/si-data"
import { SI_STATUS_LABELS } from "@/lib/types"
import { Save, SendHorizonal, X, ChevronLeft, Check } from "lucide-react"

interface SiFormProps {
  mode: "new" | "edit"
  initial?: SiItem
}

export function SiForm({ mode, initial }: SiFormProps) {
  const router = useRouter()
  const [title, setTitle] = useState(initial?.title ?? "")
  const [mainType, setMainType] = useState(initial?.mainType ?? "")
  const [trope, setTrope] = useState(initial?.trope ?? "")
  const [benchmark, setBenchmark] = useState(initial?.benchmark ?? "")
  const [authors, setAuthors] = useState<string[]>(initial?.authors ?? [])
  const [remark, setRemark] = useState(initial?.remark ?? "")
  const [freshTwist, setFreshTwist] = useState(initial?.freshTwist ?? "")
  const [synopsis, setSynopsis] = useState(initial?.synopsis ?? "")
  const [showErrors, setShowErrors] = useState(false)
  const [prereleaseOpen, setPrereleaseOpen] = useState(false)

  const titleError = showErrors && !title.trim()
  const typeError = showErrors && !mainType
  const synopsisError = showErrors && !synopsis.trim()
  const isValid = title.trim() && mainType && synopsis.trim()

  function toggleAuthor(name: string) {
    setAuthors((prev) => (prev.includes(name) ? prev.filter((a) => a !== name) : [...prev, name]))
  }

  function handleSaveDraft() {
    if (!isValid) {
      setShowErrors(true)
      return
    }
    router.push("/si")
  }

  function handleSaveAndPrerelease() {
    if (!isValid) {
      setShowErrors(true)
      return
    }
    setPrereleaseOpen(true)
  }

  return (
    <div className="flex flex-col gap-6 pb-24">
      <PageHeader
        breadcrumb={["SI 选题策划库", mode === "new" ? "新建 SI" : "编辑 SI"]}
        title={mode === "new" ? "新建选题策划" : "编辑选题策划"}
        description="填写选题基础信息与核心内容，保存后将自动生成版本快照"
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* 基础信息 + 核心内容 */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card className="flex flex-col gap-5 p-5">
            <h2 className="text-sm font-semibold text-foreground">基础信息</h2>

            <div className="space-y-2">
              <Label htmlFor="title">
                SI 标题 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="为这个选题起一个标题"
                className={cn(titleError && "border-red-500")}
              />
              {titleError && <p className="text-xs text-red-500">请填写 SI 标题</p>}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>
                  主类型 <span className="text-red-500">*</span>
                </Label>
                <Select value={mainType} onValueChange={setMainType}>
                  <SelectTrigger className={cn(typeError && "border-red-500")}>
                    <SelectValue placeholder="选择主类型" />
                  </SelectTrigger>
                  <SelectContent>
                    {MAIN_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {typeError && <p className="text-xs text-red-500">请选择主类型</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="trope">Trope</Label>
                <Input
                  id="trope"
                  value={trope}
                  onChange={(e) => setTrope(e.target.value)}
                  placeholder="自由输入，如：马甲爽文 / 扮猪吃虎"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="benchmark">对标书目</Label>
              <Input
                id="benchmark"
                value={benchmark}
                onChange={(e) => setBenchmark(e.target.value)}
                placeholder="参考或对标的作品"
              />
            </div>

            <div className="space-y-2">
              <Label>适配作者（多选）</Label>
              <div className="flex flex-wrap gap-2">
                {BOUND_AUTHORS.map((a) => {
                  const checked = authors.includes(a.name)
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => toggleAuthor(a.name)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors",
                        checked
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border hover:border-primary/40",
                      )}
                    >
                      {checked && <Check className="size-3.5 text-primary" />}
                      {a.name}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="remark">备注</Label>
              <Textarea
                id="remark"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="补充说明，如节奏要求、注意事项等"
                rows={2}
              />
            </div>
          </Card>

          <Card className="flex flex-col gap-5 p-5">
            <h2 className="text-sm font-semibold text-foreground">核心内容</h2>
            <div className="space-y-2">
              <Label htmlFor="fresh">Fresh Twist</Label>
              <Textarea
                id="fresh"
                value={freshTwist}
                onChange={(e) => setFreshTwist(e.target.value)}
                placeholder="这个选题最与众不同的创新点"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="synopsis">
                核心故事梗概 <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="synopsis"
                value={synopsis}
                onChange={(e) => setSynopsis(e.target.value)}
                placeholder="用一段话讲清楚故事的主线"
                rows={6}
                className={cn(synopsisError && "border-red-500")}
              />
              {synopsisError && <p className="text-xs text-red-500">请填写核心故事梗概</p>}
            </div>
          </Card>
        </div>

        {/* 状态信息 */}
        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-4 p-5">
            <h2 className="text-sm font-semibold text-foreground">状态信息</h2>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">当前状态</span>
              <StatusBadge
                label={initial ? SI_STATUS_LABELS[initial.status] : "草稿"}
                tone={initial ? SI_STATUS_TONE[initial.status] : "neutral"}
              />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">创建编辑</span>
              <span className="text-foreground">{initial?.createdBy ?? "林编辑"}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">最近更新</span>
              <span className="text-foreground">{initial?.updatedAt ?? "—"}</span>
            </div>
          </Card>

          <Card className="p-4 text-xs leading-relaxed text-muted-foreground">
            提示：保存草稿后系统会自动生成 SI 版本快照；保存并预发会先保存内容，再打开预发弹窗。SI
            版本历史仅用于选题追溯，不属于项目四阶段 Doc 版本。
          </Card>
        </div>
      </div>

      {/* 底部操作栏 */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-end gap-2 px-4 py-3 sm:px-6">
          <Button variant="ghost" onClick={() => router.push("/si")}>
            <ChevronLeft className="mr-1 size-4" />
            返回列表
          </Button>
          <Button variant="outline" className="bg-transparent" onClick={() => router.push("/si")}>
            <X className="mr-1 size-4" />
            取消
          </Button>
          <Button variant="outline" className="bg-transparent" onClick={handleSaveDraft}>
            <Save className="mr-1 size-4" />
            保存草稿
          </Button>
          <Button onClick={handleSaveAndPrerelease}>
            <SendHorizonal className="mr-1 size-4" />
            保存并预发
          </Button>
        </div>
      </div>

      <PrereleaseDialog
        open={prereleaseOpen}
        onOpenChange={setPrereleaseOpen}
        si={{ title: title || "未命名选题", mainType: mainType || "—", trope }}
      />
    </div>
  )
}
