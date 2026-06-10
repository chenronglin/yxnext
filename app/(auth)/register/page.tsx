"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { fetchJson } from "@/lib/api"

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    confirm: "",
    penName: "",
    bio: "",
  })
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  function update(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (!form.username.trim() || !form.email.trim() || !form.password || !form.penName.trim()) {
      setError("请完整填写必填项")
      return
    }
    if (form.password !== form.confirm) {
      setError("两次输入的密码不一致")
      return
    }

    setSubmitting(true)

    try {
      // 注册页现在直接提交真实注册申请，后端会同步创建管理员通知和待审批待办。
      await fetchJson("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: form.username,
          email: form.email,
          password: form.password,
          confirmPassword: form.confirm,
          penName: form.penName,
          bio: form.bio,
        }),
      })

      router.push("/account-status?status=pending&from=register")
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "注册申请提交失败，请稍后重试")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="border-border shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">注册申请</CardTitle>
        <CardDescription>提交注册申请，管理员审批通过后可进入平台</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="username">
              用户名 / 登录账号 <span className="text-destructive">*</span>
            </Label>
            <Input id="username" value={form.username} onChange={(e) => update("username", e.target.value)} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="email">
              邮箱 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              autoComplete="email"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">
                密码 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirm">
                确认密码 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="confirm"
                type="password"
                value={form.confirm}
                onChange={(e) => update("confirm", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label>申请角色</Label>
              <Input value="作者（固定）" disabled />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="penName">
                笔名 / 真实姓名 <span className="text-destructive">*</span>
              </Label>
              <Input id="penName" value={form.penName} onChange={(e) => update("penName", e.target.value)} />
            </div>
          </div>

          <p className="text-xs leading-5 text-muted-foreground">
            为避免外部注册直接申请编辑权限，公开注册入口当前只接受作者申请；编辑账号需由管理员在后台创建或后续治理调整。
          </p>

          <div className="flex flex-col gap-2">
            <Label htmlFor="bio">个人简介</Label>
            <Textarea
              id="bio"
              rows={3}
              placeholder="可填写擅长题材、过往作品等"
              value={form.bio}
              onChange={(e) => update("bio", e.target.value)}
            />
          </div>

          <Button type="submit" className="mt-2 w-full" disabled={submitting}>
            {submitting ? "提交中..." : "提交注册申请"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            已有账号？{" "}
            <Link href="/login" className="text-primary hover:underline">
              返回登录
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
