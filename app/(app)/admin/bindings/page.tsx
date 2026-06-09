"use client"

import { useEffect, useState } from "react"
import { Link2Off, Plus, Upload } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { fetchJson } from "@/lib/api"
import type { Binding } from "@/types/admin"
import type { ProjectPersonOption } from "@/types/project"

type BindingsResponse = {
  bindings: Binding[]
  editors: ProjectPersonOption[]
  authors: ProjectPersonOption[]
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN")
}

export default function BindingsPage() {
  const [bindings, setBindings] = useState<Binding[]>([])
  const [editors, setEditors] = useState<ProjectPersonOption[]>([])
  const [authors, setAuthors] = useState<ProjectPersonOption[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [unbindTarget, setUnbindTarget] = useState<Binding | null>(null)
  const [newEditor, setNewEditor] = useState("")
  const [newAuthor, setNewAuthor] = useState("")
  const selectedEditorName = editors.find((editor) => editor.id === newEditor)?.name
  const selectedAuthorName = authors.find((author) => author.id === newAuthor)?.name

  async function loadBindings() {
    // 绑定管理页除了关系表本身，还要拿到当前可选编辑和作者，供新建绑定弹窗使用。
    setLoading(true)
    setMessage(null)

    try {
      const response = await fetchJson<BindingsResponse>("/api/admin/bindings")
      setBindings(response.bindings)
      setEditors(response.editors)
      setAuthors(response.authors)
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "绑定关系读取失败",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadBindings()
  }, [])

  async function handleCreateBinding() {
    if (!newEditor || !newAuthor || submitting) return

    setSubmitting(true)
    setMessage(null)

    try {
      const response = await fetchJson<{ binding: Binding }>("/api/admin/bindings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          editorId: newEditor,
          authorId: newAuthor,
        }),
      })

      setMessage({
        type: "success",
        text: `绑定「${response.binding.editor} - ${response.binding.author}」已创建`,
      })
      setAddOpen(false)
      setNewEditor("")
      setNewAuthor("")
      await loadBindings()
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "新增绑定失败",
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleUnbind() {
    if (!unbindTarget || submitting) return

    setSubmitting(true)
    setMessage(null)

    try {
      await fetchJson<{ binding: Binding }>(`/api/admin/bindings/${unbindTarget.id}/unbind`, {
        method: "POST",
      })

      setMessage({
        type: "success",
        text: `绑定「${unbindTarget.editor} - ${unbindTarget.author}」已解绑`,
      })
      setUnbindTarget(null)
      await loadBindings()
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "解绑失败",
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["编辑-作者绑定"]}
        title="编辑-作者绑定管理"
        description="维护编辑与作者的绑定关系，决定 SI 预发范围与协作可见性"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" className="bg-transparent" disabled>
              <Upload className="mr-1.5 size-4" />
              批量导入
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="mr-1.5 size-4" />
              新增绑定
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

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">编辑</th>
                <th className="px-4 py-3 font-medium">作者</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">创建时间</th>
                <th className="px-4 py-3 font-medium">操作人</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    正在加载绑定关系...
                  </td>
                </tr>
              )}
              {!loading && bindings.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    暂无绑定关系
                  </td>
                </tr>
              )}
              {!loading &&
                bindings.map((binding) => (
                  <tr key={binding.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium text-foreground">{binding.editor}</td>
                    <td className="px-4 py-3 text-muted-foreground">{binding.author}</td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        label={binding.status === "active" ? "生效中" : "已解绑"}
                        tone={binding.status === "active" ? "success" : "neutral"}
                      />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDateTime(binding.createdAt)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{binding.operator}</td>
                    <td className="px-4 py-3 text-right">
                      {binding.status === "active" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 bg-transparent text-red-600 hover:text-red-600"
                          disabled={submitting}
                          onClick={() => setUnbindTarget(binding)}
                        >
                          <Link2Off className="mr-1 size-3.5" />
                          解绑
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-muted-foreground">
        绑定关系影响编辑预发 SI 时可选的作者范围。编辑预发时，作者选择器只展示已绑定作者。
      </p>

      <Dialog open={addOpen} onOpenChange={(open) => !open && !submitting && setAddOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增绑定</DialogTitle>
            <DialogDescription>
              选择编辑和作者创建绑定关系。一个作者同一时刻只能绑定给一个编辑，已绑定作者不会出现在下拉列表中。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2">
              <Label>编辑</Label>
              <Select value={newEditor} onValueChange={setNewEditor}>
                <SelectTrigger>
                  <SelectValue>{selectedEditorName ?? "选择编辑"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {editors.map((editor) => (
                    <SelectItem key={editor.id} value={editor.id}>
                      {editor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>作者</Label>
              <Select value={newAuthor} onValueChange={setNewAuthor}>
                <SelectTrigger>
                  <SelectValue>{selectedAuthorName ?? "选择作者"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {authors.length === 0 && (
                    <div className="px-2 py-2 text-sm text-muted-foreground">当前没有可绑定的作者</div>
                  )}
                  {authors.map((author) => (
                    <SelectItem key={author.id} value={author.id}>
                      {author.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="bg-transparent" disabled={submitting} onClick={() => setAddOpen(false)}>
              取消
            </Button>
            <Button disabled={!newEditor || !newAuthor || submitting} onClick={() => void handleCreateBinding()}>
              {submitting ? "提交中..." : "确认绑定"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={unbindTarget !== null} onOpenChange={(open) => !open && setUnbindTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认解绑</DialogTitle>
            <DialogDescription>
              确认解除「{unbindTarget?.editor} - {unbindTarget?.author}」的绑定关系？解绑后将通知相关编辑和作者。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="bg-transparent" disabled={submitting} onClick={() => setUnbindTarget(null)}>
              取消
            </Button>
            <Button className="bg-red-600 hover:bg-red-700" disabled={submitting} onClick={() => void handleUnbind()}>
              {submitting ? "处理中..." : "确认解绑"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
