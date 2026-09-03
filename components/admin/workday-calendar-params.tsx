"use client"

import { useEffect, useState } from "react"
import { Plus, Save, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { fetchJson } from "@/lib/api"
import type { WorkdayExceptionItem } from "@/types/admin"

type CalendarResponse = { year: number; items: WorkdayExceptionItem[] }
type DraftItem = Pick<WorkdayExceptionItem, "date" | "isWorkday" | "name">

export function WorkdayCalendarParams() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [items, setItems] = useState<DraftItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function loadCalendar(targetYear: number) {
    setLoading(true)
    setMessage(null)
    try {
      setItems((await fetchJson<CalendarResponse>(`/api/admin/params/workday-exceptions?year=${targetYear}`)).items)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "工作日日历读取失败")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadCalendar(year) }, [year])

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
  }

  async function saveCalendar() {
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetchJson<CalendarResponse>("/api/admin/params/workday-exceptions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, items }),
      })
      setItems(response.items)
      setMessage(`${year} 年工作日日历已保存`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "工作日日历保存失败")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2"><Input className="w-28" type="number" min={2000} max={2100} value={year} onChange={(event) => setYear(Number(event.target.value))} /><span className="text-sm text-muted-foreground">年</span></div>
        <div className="flex gap-2"><Button variant="outline" onClick={() => setItems((current) => [...current, { date: `${year}-01-01`, isWorkday: false, name: "" }])}><Plus className="mr-1.5 size-4" />新增例外</Button><Button disabled={saving || loading} onClick={() => void saveCalendar()}><Save className="mr-1.5 size-4" />{saving ? "保存中..." : "批量保存"}</Button></div>
      </div>
      {message && <p className="rounded-md bg-muted px-3 py-2 text-sm">{message}</p>}
      <Card className="overflow-hidden">
        <table className="w-full min-w-[680px] text-sm"><thead><tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground"><th className="px-4 py-3">日期</th><th className="px-4 py-3">类型</th><th className="px-4 py-3">说明</th><th className="px-4 py-3 text-right">操作</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">正在加载...</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">当前年份没有例外日期，默认周一至周五为工作日。</td></tr>}
            {items.map((item, index) => <tr key={`${item.date}-${index}`} className="border-b last:border-0"><td className="px-4 py-3"><Input type="date" value={item.date} onChange={(event) => updateItem(index, { date: event.target.value })} /></td><td className="px-4 py-3"><Select value={item.isWorkday ? "workday" : "holiday"} onValueChange={(value) => updateItem(index, { isWorkday: value === "workday" })}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="holiday">非工作日</SelectItem><SelectItem value="workday">调休工作日</SelectItem></SelectContent></Select></td><td className="px-4 py-3"><Input maxLength={100} value={item.name} placeholder="国庆节 / 调休" onChange={(event) => updateItem(index, { name: event.target.value })} /></td><td className="px-4 py-3 text-right"><Button size="sm" variant="ghost" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="size-3.5" /></Button></td></tr>)}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
