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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    username: "",
    contact: "",
    password: "",
    confirm: "",
    role: "author",
    penName: "",
    bio: "",
  })
  const [error, setError] = useState("")

  function update(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (!form.username.trim() || !form.contact.trim() || !form.password || !form.penName.trim()) {
      setError("请完整填写必填项")
      return
    }
    if (form.password !== form.confirm) {
      setError("两次输入的密码不一致")
      return
    }
    router.push("/account-status?status=pending&from=register")
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
            <Label htmlFor="contact">
              手机号或邮箱 <span className="text-destructive">*</span>
            </Label>
            <Input id="contact" value={form.contact} onChange={(e) => update("contact", e.target.value)} />
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
              <Select value={form.role} onValueChange={(v) => update("role", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="author">作者</SelectItem>
                  <SelectItem value="editor">编辑</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="penName">
                笔名 / 真实姓名 <span className="text-destructive">*</span>
              </Label>
              <Input id="penName" value={form.penName} onChange={(e) => update("penName", e.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="bio">简介或备注</Label>
            <Textarea
              id="bio"
              rows={3}
              placeholder="可填写擅长题材、过往作品等"
              value={form.bio}
              onChange={(e) => update("bio", e.target.value)}
            />
          </div>

          <Button type="submit" className="mt-2 w-full">
            提交注册申请
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
