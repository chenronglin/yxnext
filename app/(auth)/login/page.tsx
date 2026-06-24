"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useT } from "@/hooks/use-t"

export default function LoginPage() {
  const t = useT()
  const router = useRouter()
  const [account, setAccount] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (!account.trim() || !password.trim()) {
      setError(t("auth.login.required"))
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

      const result = (await response.json().catch(() => null)) as {
        message?: string
        currentUser?: {
          passwordResetRequired?: boolean
        }
      } | null

      if (!response.ok) {
        // 登录失败统一只展示通用错误，不再根据接口返回细节分流到账号状态页，
        // 避免前端变成账号状态枚举的放大器。
        setError(result?.message ?? t("auth.login.failed"))
        return
      }

      // 登录成功后刷新服务端组件缓存，让 app 布局立刻读到新的 session cookie。
      // 管理员重置密码后的首次登录不允许继续进入业务首页，
      // 必须先跳到设置页完成一次自助改密。
      router.replace(result?.currentUser?.passwordResetRequired ? "/settings?mustChangePassword=1" : "/dashboard")
      router.refresh()
    } catch {
      setError(t("common.networkError"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="border-border shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">{t("auth.login.title")}</CardTitle>
        <CardDescription>{t("auth.login.description")}</CardDescription>
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
            <Label htmlFor="username">{t("auth.login.account")}</Label>
            <Input
              id="username"
              placeholder={t("auth.login.accountPlaceholder")}
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              autoComplete="username"
              disabled={submitting}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">{t("auth.login.password")}</Label>
            <Input
              id="password"
              type="password"
              placeholder={t("auth.login.passwordPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={submitting}
            />
          </div>

          <Button type="submit" className="mt-2 w-full" disabled={submitting}>
            {submitting ? t("auth.login.submitting") : t("auth.login.submit")}
          </Button>

          {/* 底部辅助入口统一左对齐，避免忘记密码入口挤占密码输入区的视觉焦点。 */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-left text-sm text-muted-foreground">
            <Link href="/forgot-password" className="text-primary hover:underline">
              {t("auth.login.forgotPassword")}
            </Link>
            <span>{t("auth.login.noAccount")}</span>
            <Link href="/register" className="text-primary hover:underline">
              {t("auth.login.register")}
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
