"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { PageHeader } from "@/components/page-header"
import { PrereleaseDialog } from "@/components/si/prerelease-dialog"
import { StatusBadge } from "@/components/status-badge"
import { useRole } from "@/components/role-provider"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { fetchJson } from "@/lib/api"
import { cn } from "@/lib/utils"
import { SI_STATUS_LABELS } from "@/types/domain"
import { DEFAULT_MAIN_TYPES, SI_STATUS_TONE, type BoundAuthor, type SiItem } from "@/types/si"
import { Check, ChevronLeft, Save, SendHorizonal, X } from "lucide-react"

interface SiFormProps {
  mode: "new" | "edit"
  initial?: SiItem
}

type BoundAuthorsResponse = {
  authors: BoundAuthor[]
}

type MainTypesResponse = {
  items: Array<{
    name: string
    value: string
  }>
}

type SiDetailResponse = {
  si: SiItem
}

const TROPE_USER_CACHE_KEY = "trope-user-cached-tags"
const LEGACY_TROPE_CACHE_KEY = "trope-cached-tags"

export function SiForm({ mode, initial }: SiFormProps) {
  const router = useRouter()
  const { user } = useRole()
  const [savedSi, setSavedSi] = useState<SiItem | undefined>(initial)
  const [title, setTitle] = useState(initial?.title ?? "")
  const [mainType, setMainType] = useState(initial?.mainType ?? "")
  const [tags, setTags] = useState<string[]>(() => {
    if (!initial?.trope) return []
    return initial.trope
      .split(/\s*\/\s*/)
      .map((tag) => tag.trim())
      .filter(Boolean)
  })
  const [tagInput, setTagInput] = useState("")
  const [cachedTags, setCachedTags] = useState<string[]>([])
  const [mainTypeOptions, setMainTypeOptions] = useState<string[]>(() => Array.from(DEFAULT_MAIN_TYPES))
  const [boundAuthors, setBoundAuthors] = useState<BoundAuthor[]>([])
  const [selectedAuthorIds, setSelectedAuthorIds] = useState<string[]>(initial?.authorIds ?? [])
  const [remark, setRemark] = useState(initial?.remark ?? "")
  const [freshTwist, setFreshTwist] = useState(initial?.freshTwist ?? "")
  const [synopsis, setSynopsis] = useState(initial?.synopsis ?? "")
  const [showErrors, setShowErrors] = useState(false)
  const [prereleaseOpen, setPrereleaseOpen] = useState(false)
  const [loadingAuthors, setLoadingAuthors] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null)

  useEffect(() => {
    // Trope 历史标签只来自用户在当前浏览器里主动输入过的内容。
    // 新建 SI 页面不能预置业务标签，否则用户删除后再次进入页面还会看到默认项，和“历史缓存”的语义不一致。
    // 旧缓存 key 曾经可能混入系统默认标签，进入表单时主动清掉，避免历史脏数据继续回填。
    localStorage.removeItem(LEGACY_TROPE_CACHE_KEY)

    const saved = localStorage.getItem(TROPE_USER_CACHE_KEY)

    if (!saved) {
      setCachedTags([])
      return
    }

    try {
      const parsed = JSON.parse(saved)

      if (Array.isArray(parsed)) {
        const nextTags = Array.from(
          new Set(parsed.map((tag) => (typeof tag === "string" ? tag.trim() : "")).filter(Boolean)),
        )

        setCachedTags(nextTags)
        return
      }
    } catch {
      // 本地缓存损坏时清空该 key，避免错误数据持续影响后续进入页面。
    }

    localStorage.removeItem(TROPE_USER_CACHE_KEY)
    setCachedTags([])
  }, [])

  useEffect(() => {
    // 主类型由管理员参数页维护；接口失败时保留本地默认项，避免网络问题阻断编辑表单。
    void fetchJson<MainTypesResponse>("/api/si-main-types")
      .then((response) => {
        const activeNames = response.items.map((item) => item.name.trim()).filter(Boolean)
        const nextOptions = Array.from(new Set([...(initial?.mainType ? [initial.mainType] : []), ...activeNames]))

        setMainTypeOptions(nextOptions.length > 0 ? nextOptions : Array.from(DEFAULT_MAIN_TYPES))
      })
      .catch(() => {
        setMainTypeOptions(Array.from(new Set([...(initial?.mainType ? [initial.mainType] : []), ...DEFAULT_MAIN_TYPES])))
      })
  }, [initial?.mainType])

  useEffect(() => {
    // 适配作者和预发作者都沿用“绑定作者”口径，先读取编辑当前可操作的作者集合。
    setLoadingAuthors(true)

    void fetchJson<BoundAuthorsResponse>("/api/si/bound-authors")
      .then((response) => {
        setBoundAuthors(response.authors)
      })
      .catch((error) => {
        setMessage({
          type: "error",
          text: error instanceof Error ? error.message : "绑定作者读取失败",
        })
      })
      .finally(() => {
        setLoadingAuthors(false)
      })
  }, [])

  const titleError = showErrors && !title.trim()
  const typeError = showErrors && !mainType
  const synopsisError = showErrors && !synopsis.trim()
  const isValid = Boolean(title.trim() && mainType && synopsis.trim())

  function addTag(tag: string) {
    const trimmed = tag.trim()
    if (!trimmed) return

    if (!tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed])
    }

    if (!cachedTags.includes(trimmed)) {
      const nextCache = [...cachedTags, trimmed]
      setCachedTags(nextCache)
      localStorage.setItem(TROPE_USER_CACHE_KEY, JSON.stringify(nextCache))
    }
  }

  function removeTag(tagToRemove: string) {
    setTags((prev) => prev.filter((tag) => tag !== tagToRemove))
  }

  function deleteCachedTag(tagToDelete: string, event: React.MouseEvent) {
    event.stopPropagation()
    const nextCache = cachedTags.filter((tag) => tag !== tagToDelete)
    setCachedTags(nextCache)

    if (nextCache.length === 0) {
      // 删除最后一个历史标签后不保留空数组缓存，下一次进入页面应展示纯空态。
      localStorage.removeItem(TROPE_USER_CACHE_KEY)
      return
    }

    localStorage.setItem(TROPE_USER_CACHE_KEY, JSON.stringify(nextCache))
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      addTag(tagInput)
      setTagInput("")
    }
  }

  function toggleAuthor(authorId: string) {
    setSelectedAuthorIds((prev) =>
      prev.includes(authorId) ? prev.filter((id) => id !== authorId) : [...prev, authorId],
    )
  }

  async function persistSi() {
    if (!isValid || saving) {
      setShowErrors(true)
      return null
    }

    setSaving(true)
    setMessage(null)

    try {
      // 表单字段按界面口径直接提交；服务层负责把主类型、Trope 和作者关系落到数据库结构。
      const payload = {
        title,
        mainType,
        trope: tags,
        remark,
        freshTwist,
        synopsis,
        fitAuthorIds: selectedAuthorIds,
      }

      const response = savedSi
        ? await fetchJson<SiDetailResponse>(`/api/si/${savedSi.id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          })
        : await fetchJson<SiDetailResponse>("/api/si", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          })

      setSavedSi(response.si)
      setSelectedAuthorIds(response.si.authorIds)
      setMessage({
        type: "success",
        text: "SI 已保存",
      })

      return response.si
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "保存失败，请稍后重试",
      })
      return null
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveDraft() {
    // 保存草稿后直接回到 SI 详情页，避免继续停留在一个可能已持久化但 URL 仍是 new 的表单页。
    const si = await persistSi()

    if (!si) {
      return
    }

    router.push(`/si/${si.id}`)
    router.refresh()
  }

  async function handleSaveAndPrerelease() {
    // “保存并预发”必须先落库拿到真实 siId，再打开预发弹窗调用预发接口。
    const si = await persistSi()

    if (!si) {
      return
    }

    setSavedSi(si)
    setPrereleaseOpen(true)
  }

  const activeSi = savedSi

  return (
    <div className="flex flex-col gap-6 pb-24">
      <PageHeader
        breadcrumb={["SI 选题策划库", mode === "new" ? "新建 SI" : "编辑 SI"]}
        title={mode === "new" ? "新建选题策划" : "编辑选题策划"}
        description="填写选题基础信息与核心内容，保存后将自动生成版本快照"
      />

      {message && (
        <div
          className={cn(
            "rounded-md border px-4 py-3 text-sm",
            message.type === "error"
              ? "border-red-200 bg-red-50 text-red-600"
              : "border-emerald-200 bg-emerald-50 text-emerald-700",
          )}
        >
          {message.text}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
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
                onChange={(event) => setTitle(event.target.value)}
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
                    {mainTypeOptions.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {typeError && <p className="text-xs text-red-500">请选择主类型</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="trope">Trope 标签</Label>
                <div className="min-h-[38px] rounded-md border border-input bg-background p-1.5 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-medium text-foreground"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                    <input
                      id="trope"
                      type="text"
                      value={tagInput}
                      onChange={(event) => setTagInput(event.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={tags.length === 0 ? "输入后按空格或回车添加" : "添加标签..."}
                      className="min-w-[120px] flex-1 border-none bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                </div>

                {cachedTags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {cachedTags.map((tag) => {
                      const selected = tags.includes(tag)

                      return (
                        <div
                          key={tag}
                          onClick={() => (selected ? removeTag(tag) : addTag(tag))}
                          className={cn(
                            "relative inline-flex cursor-pointer select-none items-center gap-1.5 rounded-md border py-0.5 pl-2.5 pr-6 text-[11px] transition-colors",
                            selected
                              ? "border-primary/30 bg-primary/5 text-primary"
                              : "border-border bg-muted text-muted-foreground hover:bg-secondary hover:text-foreground",
                          )}
                        >
                          <span>{tag}</span>
                          <button
                            type="button"
                            onClick={(event) => deleteCachedTag(tag, event)}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 transition-colors hover:text-destructive"
                            title="从历史缓存中删除"
                          >
                            <X className="size-2.5" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>适配作者（多选）</Label>
              <div className="flex flex-wrap gap-2">
                {boundAuthors.map((author) => {
                  const checked = selectedAuthorIds.includes(author.id)

                  return (
                    <button
                      key={author.id}
                      type="button"
                      onClick={() => toggleAuthor(author.id)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors",
                        checked
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border hover:border-primary/40",
                      )}
                    >
                      {checked && <Check className="size-3.5 text-primary" />}
                      {author.name}
                    </button>
                  )
                })}
              </div>
              {!loadingAuthors && boundAuthors.length === 0 && (
                <p className="text-xs text-muted-foreground">当前没有可选的绑定作者</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="remark">作者说明</Label>
              <Textarea
                id="remark"
                value={remark}
                onChange={(event) => setRemark(event.target.value)}
                placeholder="面向作者的补充说明，如大纲要求、写作节奏提示、交稿频次等"
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
                onChange={(event) => setFreshTwist(event.target.value)}
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
                onChange={(event) => setSynopsis(event.target.value)}
                placeholder="用一段话讲清楚故事的主线"
                rows={6}
                className={cn(synopsisError && "border-red-500")}
              />
              {synopsisError && <p className="text-xs text-red-500">请填写核心故事梗概</p>}
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-4 p-5">
            <h2 className="text-sm font-semibold text-foreground">状态信息</h2>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">当前状态</span>
              <StatusBadge
                label={activeSi ? SI_STATUS_LABELS[activeSi.status] : "草稿"}
                tone={activeSi ? SI_STATUS_TONE[activeSi.status] : "neutral"}
              />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">创建编辑</span>
              <span className="text-foreground">{activeSi?.createdBy ?? user.name}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">最近更新</span>
              <span className="text-foreground">
                {activeSi ? new Date(activeSi.updatedAt).toLocaleString("zh-CN") : "—"}
              </span>
            </div>
          </Card>

          <Card className="p-4 text-xs leading-relaxed text-muted-foreground">
            {/* 这里明确提示“版本快照”和“Doc Revision”不是同一层概念，避免使用者混淆。 */}
            提示：提示信息。
          </Card>
        </div>
      </div>

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
          <Button variant="outline" className="bg-transparent" onClick={() => void handleSaveDraft()} disabled={saving}>
            <Save className="mr-1 size-4" />
            {saving ? "保存中..." : "保存草稿"}
          </Button>
          <Button onClick={() => void handleSaveAndPrerelease()} disabled={saving}>
            <SendHorizonal className="mr-1 size-4" />
            {saving ? "保存中..." : "保存并预发"}
          </Button>
        </div>
      </div>

      {savedSi && (
        <PrereleaseDialog
          open={prereleaseOpen}
          onOpenChange={setPrereleaseOpen}
          si={savedSi}
          prereleasedAuthorIds={savedSi.preissues.filter((item) => item.status === "active").map((item) => item.authorId)}
          onSubmitted={() => {
            setPrereleaseOpen(false)
            router.push(`/si/${savedSi.id}`)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
