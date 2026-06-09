"use client"

import { useState } from "react"
import { useRole } from "@/components/role-provider"
import { ROLE_LABELS } from "@/types/domain"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { StatusBadge } from "@/components/status-badge"

export default function SettingsPage() {
  const { user, role } = useRole()
  const [contact, setContact] = useState({ phone: user.phone ?? "", email: user.email })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader breadcrumb={["个人设置"]} title="个人设置" description="维护个人信息、修改密码与查看绑定关系" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 基础信息 */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">基础信息</CardTitle>
            <CardDescription>账号、角色与审批状态不可由本人修改</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="flex items-center gap-4">
              <Avatar className="size-16">
                <AvatarFallback className="bg-primary text-lg text-primary-foreground">
                  {user.name.slice(0, 1)}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-foreground">{user.name}</span>
                  <StatusBadge label={ROLE_LABELS[role]} tone="info" />
                </div>
                <Button variant="outline" size="sm" className="bg-transparent">
                  更换头像
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label>登录账号</Label>
                <Input value={user.username} disabled />
              </div>
              <div className="flex flex-col gap-2">
                <Label>角色</Label>
                <Input value={ROLE_LABELS[role]} disabled />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="phone">手机号</Label>
                <Input
                  id="phone"
                  value={contact.phone}
                  onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">邮箱</Label>
                <Input
                  id="email"
                  value={contact.email}
                  onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button>保存修改</Button>
            </div>
          </CardContent>
        </Card>

        {/* 绑定信息 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">绑定信息</CardTitle>
            <CardDescription>展示当前协作绑定关系</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            {role === "author" && (
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
                <span className="text-muted-foreground">负责编辑</span>
                <span className="font-medium text-foreground">林编辑</span>
              </div>
            )}
            {role === "editor" && (
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
                <span className="text-muted-foreground">绑定作者数量</span>
                <span className="font-medium text-foreground">8 位</span>
              </div>
            )}
            {role === "admin" && (
              <p className="text-muted-foreground">管理员账号不参与编辑-作者绑定关系。</p>
            )}
          </CardContent>
        </Card>

        {/* 修改密码 */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">修改密码</CardTitle>
            <CardDescription>管理员重置密码在用户管理页面完成，不在此处操作</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="old">旧密码</Label>
                <Input id="old" type="password" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="new">新密码</Label>
                <Input id="new" type="password" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="confirm">确认新密码</Label>
                <Input id="confirm" type="password" />
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <Button>更新密码</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
