"use client"

import { useEffect, useState } from "react"
import { Info, Pencil, Plus, Power, Save } from "lucide-react"

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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { fetchJson } from "@/lib/api"
import type { StagePlanDefaultItem, SysParam } from "@/types/admin"

type MainTypeResponse = {
  items: SysParam[]
}

type StagePlanDefaultsResponse = {
  items: StagePlanDefaultItem[]
}

type MainTypeMutationResponse = {
  item: SysParam
}

type MainTypeFormState = {
  name: string
  value: string
  order: string
  status: "active" | "inactive"
}

const EMPTY_MAIN_TYPE_FORM: MainTypeFormState = {
  name: "",
  value: "",
  order: "0",
  status: "active",
}

function formatDateTime(value: string) {
  return value ? new Date(value).toLocaleString("zh-CN") : "—"
}

export default function ParamsPage() {
  const [mainTypes, setMainTypes] = useState<SysParam[]>([])
  const [stageDefaults, setStageDefaults] = useState<StagePlanDefaultItem[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<SysParam | null>(null)
  const [mainTypeForm, setMainTypeForm] = useState<MainTypeFormState>(EMPTY_MAIN_TYPE_FORM)
  const [stageDraft, setStageDraft] = useState<Record<string, { days: string; warningDaysBeforeDue: string }>>({})

  async function loadParams() {
    // 参数页包含两类独立配置：SI 主类型和阶段计划默认值，统一在进入页面时并行读取。
    setLoading(true)
    setMessage(null)

    try {
      const [mainTypeResponse, stageDefaultsResponse] = await Promise.all([
        fetchJson<MainTypeResponse>("/api/admin/params/si-main-types"),
        fetchJson<StagePlanDefaultsResponse>("/api/admin/params/stage-plan-defaults"),
      ])

      setMainTypes(mainTypeResponse.items)
      setStageDefaults(stageDefaultsResponse.items)
      setStageDraft(
        Object.fromEntries(
          stageDefaultsResponse.items.map((item) => [
            item.stage,
            {
              days: String(item.days),
              warningDaysBeforeDue: String(item.warningDaysBeforeDue),
            },
          ]),
        ),
      )
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "参数读取失败",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadParams()
  }, [])

  function openCreateDialog() {
    // 新增主类型时清空表单，避免把上一次编辑内容带入。
    setEditingItem(null)
    setMainTypeForm(EMPTY_MAIN_TYPE_FORM)
    setDialogOpen(true)
  }

  function openEditDialog(item: SysParam) {
    // 编辑主类型时把当前记录完整回填，管理员可直接修改启停状态和排序。
    setEditingItem(item)
    setMainTypeForm({
      name: item.name,
      value: item.value,
      order: String(item.order),
      status: item.status,
    })
    setDialogOpen(true)
  }

  async function handleSaveMainType() {
    if (submitting) return

    setSubmitting(true)
    setMessage(null)

    try {
      const payload = {
        name: mainTypeForm.name,
        value: mainTypeForm.value,
        order: Number(mainTypeForm.order || "0"),
        status: mainTypeForm.status,
      }

      const response = editingItem
        ? await fetchJson<MainTypeMutationResponse>(`/api/admin/params/si-main-types/${editingItem.id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          })
        : await fetchJson<MainTypeMutationResponse>("/api/admin/params/si-main-types", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          })

      setMessage({
        type: "success",
        text: editingItem ? `主类型「${response.item.name}」已更新` : `主类型「${response.item.name}」已创建`,
      })
      setDialogOpen(false)
      await loadParams()
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "主类型保存失败",
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleToggleMainType(item: SysParam) {
    if (submitting) return

    setSubmitting(true)
    setMessage(null)

    try {
      await fetchJson<MainTypeMutationResponse>(`/api/admin/params/si-main-types/${item.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: item.status === "active" ? "inactive" : "active",
        }),
      })

      setMessage({
        type: "success",
        text: item.status === "active" ? `主类型「${item.name}」已停用` : `主类型「${item.name}」已启用`,
      })
      await loadParams()
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "主类型状态更新失败",
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSaveStageDefaults() {
    if (submitting) return

    setSubmitting(true)
    setMessage(null)

    try {
      await fetchJson<StagePlanDefaultsResponse>("/api/admin/params/stage-plan-defaults", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: stageDefaults.map((item) => ({
            stage: item.stage,
            days: Number(stageDraft[item.stage]?.days ?? item.days),
            warningDaysBeforeDue: Number(stageDraft[item.stage]?.warningDaysBeforeDue ?? item.warningDaysBeforeDue),
          })),
        }),
      })

      setMessage({
        type: "success",
        text: "阶段计划默认值已保存",
      })
      await loadParams()
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "阶段计划默认值保存失败",
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["参数管理"]}
        title="参数管理"
        description="维护系统业务参数，主要包括 SI 主类型等后台统一配置"
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

      <Tabs defaultValue="main-type">
        <TabsList>
          <TabsTrigger value="main-type">SI 主类型</TabsTrigger>
          <TabsTrigger value="stage-plan">阶段计划默认值</TabsTrigger>
          <TabsTrigger value="other">其他扩展参数</TabsTrigger>
        </TabsList>

        <TabsContent value="main-type" className="mt-4 flex flex-col gap-4">
          <div className="flex justify-end">
            <Button onClick={openCreateDialog}>
              <Plus className="mr-1.5 size-4" />
              新增主类型
            </Button>
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">参数名称</th>
                    <th className="px-4 py-3 font-medium">参数值</th>
                    <th className="px-4 py-3 font-medium">状态</th>
                    <th className="px-4 py-3 font-medium">排序</th>
                    <th className="px-4 py-3 font-medium">创建时间</th>
                    <th className="px-4 py-3 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                        正在加载主类型参数...
                      </td>
                    </tr>
                  )}
                  {!loading && mainTypes.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                        暂无主类型参数
                      </td>
                    </tr>
                  )}
                  {!loading &&
                    mainTypes.map((item) => (
                      <tr key={item.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium text-foreground">{item.name}</td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{item.value}</td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            label={item.status === "active" ? "启用" : "停用"}
                            tone={item.status === "active" ? "success" : "neutral"}
                          />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{item.order}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDateTime(item.createdAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant="ghost" className="h-8 px-2" title="编辑" onClick={() => openEditDialog(item)}>
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className={
                                "h-8 px-2 " +
                                (item.status === "active"
                                  ? "text-red-600 hover:text-red-600"
                                  : "text-emerald-600 hover:text-emerald-600")
                              }
                              title={item.status === "active" ? "停用" : "启用"}
                              disabled={submitting}
                              onClick={() => void handleToggleMainType(item)}
                            >
                              <Power className="size-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card className="flex gap-3 bg-muted/40 p-4 text-sm text-muted-foreground">
            <Info className="size-4 shrink-0 text-foreground" />
            <ul className="flex flex-col gap-1.5">
              <li>停用后的主类型不再出现在新建 SI 下拉框中。</li>
              <li>已被历史 SI 使用的主类型建议仅停用，不做物理删除。</li>
              <li>Trope 不在参数管理中配置，由 SI 表单直接输入。</li>
            </ul>
          </Card>
        </TabsContent>

        <TabsContent value="stage-plan" className="mt-4 flex flex-col gap-4">
          <div className="flex justify-end">
            <Button disabled={submitting || loading} onClick={() => void handleSaveStageDefaults()}>
              <Save className="mr-1.5 size-4" />
              {submitting ? "保存中..." : "保存默认值"}
            </Button>
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">阶段</th>
                    <th className="px-4 py-3 font-medium">默认计划天数</th>
                    <th className="px-4 py-3 font-medium">提前预警天数</th>
                    <th className="px-4 py-3 font-medium">最近更新时间</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                        正在加载阶段默认值...
                      </td>
                    </tr>
                  )}
                  {!loading &&
                    stageDefaults.map((item) => (
                      <tr key={item.stage} className="border-b border-border last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium text-foreground">{item.label}</td>
                        <td className="px-4 py-3">
                          <Input
                            type="number"
                            min={1}
                            className="h-8 w-28"
                            value={stageDraft[item.stage]?.days ?? String(item.days)}
                            onChange={(event) =>
                              setStageDraft({
                                ...stageDraft,
                                [item.stage]: {
                                  ...stageDraft[item.stage],
                                  days: event.target.value,
                                },
                              })
                            }
                          />
                        </td>
                        <td className="px-4 py-3">
                          <Input
                            type="number"
                            min={0}
                            className="h-8 w-28"
                            value={stageDraft[item.stage]?.warningDaysBeforeDue ?? String(item.warningDaysBeforeDue)}
                            onChange={(event) =>
                              setStageDraft({
                                ...stageDraft,
                                [item.stage]: {
                                  ...stageDraft[item.stage],
                                  warningDaysBeforeDue: event.target.value,
                                },
                              })
                            }
                          />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDateTime(item.updatedAt)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="other" className="mt-4">
          <Card className="p-10 text-center text-sm text-muted-foreground">暂无其他扩展参数。</Card>
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && !submitting && setDialogOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? "编辑主类型" : "新增主类型"}</DialogTitle>
            <DialogDescription>
              {editingItem ? "修改主类型名称、参数值、排序和状态。" : "新增一个可在 SI 表单中使用的主类型。"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="name">参数名称</Label>
              <Input
                id="name"
                value={mainTypeForm.name}
                onChange={(event) => setMainTypeForm({ ...mainTypeForm, name: event.target.value })}
                placeholder="请输入主类型名称"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="value">参数值</Label>
              <Input
                id="value"
                value={mainTypeForm.value}
                onChange={(event) => setMainTypeForm({ ...mainTypeForm, value: event.target.value })}
                placeholder="请输入唯一参数值"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="order">排序</Label>
              <Input
                id="order"
                type="number"
                value={mainTypeForm.order}
                onChange={(event) => setMainTypeForm({ ...mainTypeForm, order: event.target.value })}
                placeholder="请输入排序值"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="status">状态</Label>
              <select
                id="status"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={mainTypeForm.status}
                onChange={(event) =>
                  setMainTypeForm({
                    ...mainTypeForm,
                    status: event.target.value as "active" | "inactive",
                  })
                }
              >
                <option value="active">启用</option>
                <option value="inactive">停用</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="bg-transparent" disabled={submitting} onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button disabled={submitting} onClick={() => void handleSaveMainType()}>
              {submitting ? "保存中..." : "确认保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
