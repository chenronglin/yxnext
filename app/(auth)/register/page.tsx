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
import { useT } from "@/hooks/use-t"

export default function RegisterPage() {
  const t = useT()
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
      setError(t("auth.register.required"))
      return
    }
    if (form.password !== form.confirm) {
      setError(t("auth.register.passwordMismatch"))
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
      setError(requestError instanceof Error ? requestError.message : t("auth.register.failed"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="border-border shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">{t("auth.register.title")}</CardTitle>
        <CardDescription>{t("auth.register.description")}</CardDescription>
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
              {t("auth.register.username")} <span className="text-destructive">{t("common.requiredMark")}</span>
            </Label>
            <Input id="username" value={form.username} onChange={(e) => update("username", e.target.value)} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="email">
              {t("auth.register.email")} <span className="text-destructive">{t("common.requiredMark")}</span>
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
                {t("auth.register.password")} <span className="text-destructive">{t("common.requiredMark")}</span>
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
                {t("auth.register.confirmPassword")} <span className="text-destructive">{t("common.requiredMark")}</span>
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
              <Label>{t("auth.register.role")}</Label>
              <Input value={t("auth.register.fixedAuthor")} disabled />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="penName">
                {t("auth.register.penName")} <span className="text-destructive">{t("common.requiredMark")}</span>
              </Label>
              <Input id="penName" value={form.penName} onChange={(e) => update("penName", e.target.value)} />
            </div>
          </div>

          <p className="text-xs leading-5 text-muted-foreground">
            {t("auth.register.policy")}
          </p>

          <div className="flex flex-col gap-2">
            <Label htmlFor="bio">{t("auth.register.bio")}</Label>
            <Textarea
              id="bio"
              rows={3}
              placeholder={t("auth.register.bioPlaceholder")}
              value={form.bio}
              onChange={(e) => update("bio", e.target.value)}
            />
          </div>

          <Button type="submit" className="mt-2 w-full" disabled={submitting}>
            {submitting ? t("auth.register.submitting") : t("auth.register.submit")}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            {t("auth.register.hasAccount")}{" "}
            <Link href="/login" className="text-primary hover:underline">
              {t("auth.register.backToLogin")}
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
