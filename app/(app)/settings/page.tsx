"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { useRole } from "@/components/role-provider"
import { ROLE_LABELS } from "@/types/domain"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { StatusBadge } from "@/components/status-badge"
import { Textarea } from "@/components/ui/textarea"
import { fetchJson } from "@/lib/api"
import type { AccountBindingInfo, AccountProfile } from "@/types/account"

type ProfileResponse = {
  profile: AccountProfile
}

type BindingsResponse = {
  bindings: AccountBindingInfo
}

export default function SettingsPage() {
  const router = useRouter()
  const { user, role } = useRole()
  const [profile, setProfile] = useState<AccountProfile | null>(null)
  const [bindings, setBindings] = useState<AccountBindingInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null)
  const [contact, setContact] = useState({ phone: user.phone ?? "", email: user.email, biography: "" })
  const [passwordForm, setPasswordForm] = useState({
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
  })

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      setMessage(null)

      try {
        // 个人设置页需要同时拿到可编辑资料和绑定摘要，前端不再用假数据拼接。
        const [profileResponse, bindingsResponse] = await Promise.all([
          fetchJson<ProfileResponse>("/api/account/profile"),
          fetchJson<BindingsResponse>("/api/account/bindings"),
        ])

        setProfile(profileResponse.profile)
        setBindings(bindingsResponse.bindings)
        setContact({
          phone: profileResponse.profile.phone ?? "",
          email: profileResponse.profile.email,
          biography: profileResponse.profile.biography ?? "",
        })
      } catch (requestError) {
        setMessage({
          type: "error",
          text: requestError instanceof Error ? requestError.message : "个人设置读取失败",
        })
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [])

  async function handleSaveProfile() {
    setSavingProfile(true)
    setMessage(null)

    try {
      const response = await fetchJson<ProfileResponse>("/api/account/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: contact.email,
          phone: contact.phone || null,
          biography: contact.biography || null,
        }),
      })

      setProfile(response.profile)
      setContact({
        phone: response.profile.phone ?? "",
        email: response.profile.email,
        biography: response.profile.biography ?? "",
      })
      setMessage({
        type: "success",
        text: "个人资料已保存",
      })
    } catch (requestError) {
      setMessage({
        type: "error",
        text: requestError instanceof Error ? requestError.message : "个人资料保存失败",
      })
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleChangePassword() {
    setSavingPassword(true)
    setMessage(null)

    try {
      const response = await fetchJson<{ ok: true; reauthRequired?: boolean }>("/api/account/password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(passwordForm),
      })

      setPasswordForm({
        oldPassword: "",
        newPassword: "",
        confirmPassword: "",
      })

      // 改密成功后，后端已经撤销全部旧会话并清除了当前 cookie。
      // 前端这里立即跳回登录页，避免用户继续停留在一个即将失效的页面状态里。
      if (response.reauthRequired) {
        router.replace("/login")
        router.refresh()
        return
      }

      setMessage({
        type: "success",
        text: "密码已更新",
      })
    } catch (requestError) {
      setMessage({
        type: "error",
        text: requestError instanceof Error ? requestError.message : "密码更新失败",
      })
    } finally {
      setSavingPassword(false)
    }
  }

  const displayName = profile?.name ?? user.name

  return (
    <div className="flex flex-col gap-6">
      <PageHeader breadcrumb={["个人设置"]} title="个人设置" description="维护个人信息、修改密码与查看绑定关系" />

      {user.passwordResetRequired && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          管理员已重置你的密码。继续使用系统前，请先完成一次新密码设置。
        </div>
      )}

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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">基础信息</CardTitle>
            <CardDescription>账号、角色与审批状态不可由本人修改</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="flex items-center gap-4">
              <Avatar className="size-16">
                <AvatarFallback className="bg-primary text-lg text-primary-foreground">
                  {displayName.slice(0, 1)}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-foreground">{displayName}</span>
                  <StatusBadge label={ROLE_LABELS[role]} tone="info" />
                </div>
                <p className="text-sm text-muted-foreground">{loading ? "正在加载资料..." : "个人资料已接入真实接口"}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label>登录账号</Label>
                <Input value={profile?.username ?? user.username} disabled />
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
                  onChange={(event) => setContact((current) => ({ ...current, phone: event.target.value }))}
                  disabled={loading || savingProfile}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">邮箱</Label>
                <Input
                  id="email"
                  value={contact.email}
                  onChange={(event) => setContact((current) => ({ ...current, email: event.target.value }))}
                  disabled={loading || savingProfile}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="biography">个人简介</Label>
              <Textarea
                id="biography"
                rows={4}
                value={contact.biography}
                onChange={(event) => setContact((current) => ({ ...current, biography: event.target.value }))}
                disabled={loading || savingProfile}
                placeholder="可填写擅长题材、个人经历或协作偏好"
              />
            </div>

            <div className="flex justify-end">
              <Button disabled={loading || savingProfile} onClick={() => void handleSaveProfile()}>
                {savingProfile ? "保存中..." : "保存修改"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">绑定信息</CardTitle>
            <CardDescription>展示当前协作绑定关系</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            {loading && <p className="text-muted-foreground">正在加载绑定信息...</p>}
            {!loading && bindings?.role === "author" && (
              <>
                {bindings.editors.length === 0 && <p className="text-muted-foreground">当前没有绑定编辑。</p>}
                {bindings.editors.map((editor) => (
                  <div key={editor.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
                    <span className="text-muted-foreground">负责编辑</span>
                    <span className="font-medium text-foreground">{editor.name}</span>
                  </div>
                ))}
              </>
            )}
            {!loading && bindings?.role === "editor" && (
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
                <span className="text-muted-foreground">绑定作者数量</span>
                <span className="font-medium text-foreground">{bindings.authorCount} 位</span>
              </div>
            )}
            {!loading && bindings?.role === "admin" && (
              <p className="text-muted-foreground">管理员账号不参与编辑-作者绑定关系。</p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">修改密码</CardTitle>
            <CardDescription>管理员重置密码在用户管理页面完成，本页只处理当前登录用户自助修改</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="old">旧密码</Label>
                <Input
                  id="old"
                  type="password"
                  value={passwordForm.oldPassword}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, oldPassword: event.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="new">新密码</Label>
                <Input
                  id="new"
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="confirm">确认新密码</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(event) =>
                    setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))
                  }
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <Button disabled={savingPassword} onClick={() => void handleChangePassword()}>
                {savingPassword ? "更新中..." : "更新密码"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
