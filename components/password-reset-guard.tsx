"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"

import { useRole } from "@/components/role-provider"

export function PasswordResetGuard() {
  const { user } = useRole()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    // 管理员重置密码后，用户必须先进入设置页完成一次自助改密；
    // 这里在客户端统一兜底，避免用户直接手输后台地址绕过登录页跳转。
    if (!user.passwordResetRequired) {
      return
    }

    if (pathname === "/settings") {
      return
    }

    router.replace("/settings?mustChangePassword=1")
  }, [pathname, router, user.passwordResetRequired])

  return null
}
