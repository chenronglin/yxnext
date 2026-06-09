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
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (!username.trim() || !password.trim()) {
      setError("请输入账号和密码")
      return
    }
    // 演示：依据账号前缀模拟不同账号状态跳转
    if (username.startsWith("pending")) {
      router.push("/account-status?status=pending")
      return
    }
    if (username.startsWith("rejected")) {
      router.push("/account-status?status=rejected")
      return
    }
    if (username.startsWith("disabled")) {
      router.push("/account-status?status=disabled")
      return
    }
    router.push("/dashboard")
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
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
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
            />
          </div>

          <Button type="submit" className="mt-2 w-full">
            登录
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            还没有账号？{" "}
            <Link href="/register" className="text-primary hover:underline">
              注册申请
            </Link>
          </p>

          <div className="rounded-md bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            演示提示：使用 <code className="font-mono">pending</code> /{" "}
            <code className="font-mono">rejected</code> / <code className="font-mono">disabled</code>{" "}
            开头的账号可预览不同账号状态页。
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
