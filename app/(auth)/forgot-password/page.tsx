"use client"

import Link from "next/link"
import { useState } from "react"
import { AlertCircle, Mail, CheckCircle2, ArrowLeft } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { fetchJson } from "@/lib/api"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (!email.trim()) {
      setError("请输入您的邮箱地址")
      return
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setError("请输入有效的邮箱地址")
      return
    }

    setSubmitting(true)

    try {
      // 忘记密码现在只做“通知管理员协助重置”，页面不再伪造邮件找回流程。
      await fetchJson("/api/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      })
      setSubmitted(true)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "提交失败，请稍后重试")
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <Card className="border-border shadow-sm">
        <CardHeader className="items-center text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 className="size-6" />
          </div>
          <CardTitle className="mt-4 text-lg">请求已提交</CardTitle>
          <CardDescription>
            如邮箱对应账号存在，系统已通知管理员协助重置密码：
            <br />
            <span className="font-medium text-foreground">{email}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-center">
          <p className="text-sm text-muted-foreground leading-relaxed">
            为了避免暴露账号是否存在，系统始终返回统一结果。管理员收到通知后会人工协助处理。
          </p>
          <Button asChild className="mt-2 w-full">
            <Link href="/login">
              <ArrowLeft className="mr-1.5 size-4" />
              返回登录
            </Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">找回密码</CardTitle>
          <CardDescription>请输入注册邮箱，系统会通知管理员协助重置密码。</CardDescription>
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
            <Label htmlFor="email">邮箱地址</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="example@yuexiang.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-9"
                autoComplete="email"
              />
            </div>
          </div>

          <Button type="submit" className="mt-2 w-full" disabled={submitting}>
            {submitting ? "提交中..." : "通知管理员重置"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            记起密码了？{" "}
            <Link href="/login" className="text-primary hover:underline">
              返回登录
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
