"use client"

import { useEffect, useState } from "react"
import { Pencil, Plus, Power } from "lucide-react"

import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { fetchJson } from "@/lib/api"
import type { SiMetadataCategory, SiMetadataOption } from "@/types/si"

type OptionsResponse = { items: SiMetadataOption[] }
type MutationResponse = { item: SiMetadataOption }

type OptionForm = {
  category: SiMetadataCategory
  name: string
  value: string
  order: string
  status: "active" | "inactive"
}

const EMPTY_FORM: OptionForm = {
  category: "si_type",
  name: "",
  value: "",
  order: "0",
  status: "active",
}

export function SiMetadataParams() {
  const [items, setItems] = useState<SiMetadataOption[]>([])
  const [editing, setEditing] = useState<SiMetadataOption | null>(null)
  const [form, setForm] = useState<OptionForm>(EMPTY_FORM)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function loadItems() {
    setLoading(true)
    try {
      setItems((await fetchJson<OptionsResponse>("/api/admin/params/si-metadata-options")).items)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "SI 配置读取失败")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadItems()
  }, [])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  function openEdit(item: SiMetadataOption) {
    setEditing(item)
    setForm({
      category: item.category,
      name: item.name,
      value: item.value,
      order: String(item.order),
      status: item.status ?? "active",
    })
    setDialogOpen(true)
  }

  async function saveItem() {
    if (saving) return
    setSaving(true)
    setMessage(null)

    try {
      const payload = { ...form, order: Number(form.order || 0) }
      const url = editing
        ? `/api/admin/params/si-metadata-options/${editing.id}`
        : "/api/admin/params/si-metadata-options"
      const response = await fetchJson<MutationResponse>(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      setMessage(`配置项「${response.item.name}」已保存`)
      setDialogOpen(false)
      await loadItems()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "SI 配置保存失败")
    } finally {
      setSaving(false)
    }
  }

  async function toggleItem(item: SiMetadataOption) {
    if (saving) return
    setSaving(true)
    try {
      await fetchJson(`/api/admin/params/si-metadata-options/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: item.status === "active" ? "inactive" : "active" }),
      })
      await loadItems()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "状态更新失败")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">维护 SI 类型和创作难度；停用项仍保留在历史快照中。</p>
        <Button onClick={openCreate}>
          <Plus className="mr-1.5 size-4" />新增配置
        </Button>
      </div>
      {message && <p className="rounded-md bg-muted px-3 py-2 text-sm">{message}</p>}
      <Card className="overflow-hidden">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-4 py-3">类别</th><th className="px-4 py-3">名称</th>
              <th className="px-4 py-3">参数值</th><th className="px-4 py-3">排序</th>
              <th className="px-4 py-3">状态</th><th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">正在加载...</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">暂无配置项</td></tr>}
            {items.map((item) => (
              <tr key={item.id} className="border-b last:border-0">
                <td className="px-4 py-3">{item.category === "si_type" ? "SI 类型" : "创作难度"}</td>
                <td className="px-4 py-3 font-medium">{item.name}</td><td className="px-4 py-3 font-mono text-xs">{item.value}</td>
                <td className="px-4 py-3">{item.order}</td>
                <td className="px-4 py-3"><StatusBadge label={item.status === "active" ? "启用" : "停用"} tone={item.status === "active" ? "success" : "neutral"} /></td>
                <td className="px-4 py-3"><div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(item)}><Pencil className="size-3.5" /></Button>
                  <Button size="sm" variant="ghost" disabled={saving} onClick={() => void toggleItem(item)}><Power className="size-3.5" /></Button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "编辑配置项" : "新增配置项"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2"><Label>类别</Label><Select disabled={Boolean(editing)} value={form.category} onValueChange={(value) => setForm((current) => ({ ...current, category: value as SiMetadataCategory }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="si_type">SI 类型</SelectItem><SelectItem value="creative_difficulty">创作难度</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label>名称</Label><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></div>
            <div className="space-y-2"><Label>参数值</Label><Input value={form.value} onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))} /></div>
            <div className="space-y-2"><Label>排序</Label><Input type="number" min={0} value={form.order} onChange={(event) => setForm((current) => ({ ...current, order: event.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button><Button disabled={saving || !form.name.trim() || !form.value.trim()} onClick={() => void saveItem()}>{saving ? "保存中..." : "保存"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
