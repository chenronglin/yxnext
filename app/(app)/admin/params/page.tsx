"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { SI_MAIN_TYPE_PARAMS } from "@/mocks/admin-data"
import { Plus, Pencil, Power, Info } from "lucide-react"

export default function ParamsPage() {
  const [params] = useState(SI_MAIN_TYPE_PARAMS)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["参数管理"]}
        title="参数管理"
        description="维护系统业务参数，主要包括 SI 主类型等后台统一配置"
      />

      <Tabs defaultValue="main-type">
        <TabsList>
          <TabsTrigger value="main-type">SI 主类型</TabsTrigger>
          <TabsTrigger value="stage-plan">阶段计划默认值</TabsTrigger>
          <TabsTrigger value="other">其他扩展参数</TabsTrigger>
        </TabsList>

        <TabsContent value="main-type" className="mt-4 flex flex-col gap-4">
          <div className="flex justify-end">
            <Button>
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
                  {params.map((p) => (
                    <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium text-foreground">{p.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.value}</td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          label={p.status === "active" ? "启用" : "停用"}
                          tone={p.status === "active" ? "success" : "neutral"}
                        />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{p.order}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.createdAt}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" className="h-8 px-2" title="编辑">
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className={
                              "h-8 px-2 " +
                              (p.status === "active" ? "text-red-600 hover:text-red-600" : "text-emerald-600 hover:text-emerald-600")
                            }
                            title={p.status === "active" ? "停用" : "启用"}
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

        <TabsContent value="stage-plan" className="mt-4">
          <Card className="p-10 text-center text-sm text-muted-foreground">
            阶段计划默认值参数尚未启用，启用后可在此配置四阶段默认计划天数。
          </Card>
        </TabsContent>

        <TabsContent value="other" className="mt-4">
          <Card className="p-10 text-center text-sm text-muted-foreground">暂无其他扩展参数。</Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
