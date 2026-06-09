"use client"

import Link from "next/link"
import { useState } from "react"
import { AlertCircle, Mail, CheckCircle2, ArrowLeft } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(e: React.FormEvent) {
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

    // Simulate sending reset link
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <Card className="border-border shadow-sm">
        <CardHeader className="items-center text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 className="size-6" />
          </div>
          <CardTitle className="mt-4 text-lg">邮件已发送</CardTitle>
          <CardDescription>
            密码重置邮件已发送至您的邮箱：
            <br />
            <span className="font-medium text-foreground">{email}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-center">
          <p className="text-sm text-muted-foreground leading-relaxed">
            请检查您的收件箱（以及垃圾邮件文件夹）。按照邮件中的提示操作即可重新设置密码。
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
        <CardDescription>请输入您的账号邮箱，我们将向您发送重置密码的链接。</CardDescription>
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

          <Button type="submit" className="mt-2 w-full">
            发送重置链接
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
