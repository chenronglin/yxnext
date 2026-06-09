"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { BINDINGS, type Binding } from "@/lib/admin-data"
import { PROJECT_EDITORS, PROJECT_AUTHORS } from "@/lib/project-data"
import { Plus, Upload, Link2Off } from "lucide-react"

export default function BindingsPage() {
  const [addOpen, setAddOpen] = useState(false)
  const [unbindTarget, setUnbindTarget] = useState<Binding | null>(null)
  const [newEditor, setNewEditor] = useState<string>("")
  const [newAuthor, setNewAuthor] = useState<string>("")

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["编辑-作者绑定"]}
        title="编辑-作者绑定管理"
        description="维护编辑与作者的绑定关系，决定 SI 预发范围与协作可见性"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" className="bg-transparent">
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

      {/* 绑定关系表 */}
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
              {BINDINGS.map((b) => (
                <tr key={b.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium text-foreground">{b.editor}</td>
                  <td className="px-4 py-3 text-muted-foreground">{b.author}</td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      label={b.status === "active" ? "生效中" : "已解绑"}
                      tone={b.status === "active" ? "success" : "neutral"}
                    />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{b.createdAt}</td>
                  <td className="px-4 py-3 text-muted-foreground">{b.operator}</td>
                  <td className="px-4 py-3 text-right">
                    {b.status === "active" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 bg-transparent text-red-600 hover:text-red-600"
                        onClick={() => setUnbindTarget(b)}
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

      {/* 新增绑定弹窗 */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增绑定</DialogTitle>
            <DialogDescription>选择编辑和作者创建绑定关系，重复绑定将被提示。</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2">
              <Label>编辑</Label>
              <Select value={newEditor} onValueChange={setNewEditor}>
                <SelectTrigger>
                  <SelectValue placeholder="选择编辑" />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_EDITORS.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>作者</Label>
              <Select value={newAuthor} onValueChange={setNewAuthor}>
                <SelectTrigger>
                  <SelectValue placeholder="选择作者" />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_AUTHORS.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="bg-transparent" onClick={() => setAddOpen(false)}>
              取消
            </Button>
            <Button disabled={!newEditor || !newAuthor} onClick={() => setAddOpen(false)}>
              确认绑定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 解绑确认弹窗 */}
      <Dialog open={!!unbindTarget} onOpenChange={(o) => !o && setUnbindTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认解绑</DialogTitle>
            <DialogDescription>
              确认解除「{unbindTarget?.editor} - {unbindTarget?.author}」的绑定关系？解绑后将通知相关编辑和作者。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="bg-transparent" onClick={() => setUnbindTarget(null)}>
              取消
            </Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={() => setUnbindTarget(null)}>
              确认解绑
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
