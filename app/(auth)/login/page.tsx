"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function LoginPage() {
  const router = useRouter()
  const [account, setAccount] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (!account.trim() || !password.trim()) {
      setError("请输入账号和密码")
      return
    }

    setSubmitting(true)

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        // 前端使用 account 字段，后端统一支持用户名或邮箱登录。
        body: JSON.stringify({
          account,
          password,
        }),
      })

      const result = (await response.json().catch(() => null)) as
        | { message?: string; status?: string }
        | null

      if (!response.ok) {
        // 待审批、已驳回、已禁用等状态由账号状态页承接，不留在登录表单里展示。
        if (
          response.status === 403 &&
          result?.status &&
          ["pending", "rejected", "disabled"].includes(result.status)
        ) {
          router.replace(`/account-status?status=${result.status}`)
          return
        }

        setError(result?.message ?? "登录失败，请检查账号和密码")
        return
      }

      // 登录成功后刷新服务端组件缓存，让 app 布局立刻读到新的 session cookie。
      router.replace("/dashboard")
      router.refresh()
    } catch {
      setError("网络异常，请稍后重试")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="border-border shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">登录</CardTitle>
        <CardDescription>请输入您的账号信息进入平台</CardDescription>
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
            <Label htmlFor="username">账号</Label>
            <Input
              id="username"
              placeholder="请输入登录账号"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              autoComplete="username"
              disabled={submitting}
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">密码</Label>
              <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                忘记密码？
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              placeholder="请输入密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={submitting}
            />
          </div>

          <Button type="submit" className="mt-2 w-full" disabled={submitting}>
            {submitting ? "登录中..." : "登录"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            还没有账号？{" "}
            <Link href="/register" className="text-primary hover:underline">
              注册申请
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
