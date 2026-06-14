import type { ReactNode } from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { RoleProvider } from "@/components/role-provider"
import { PasswordResetGuard } from "@/components/password-reset-guard"
import { SidebarProvider } from "@/components/sidebar-provider"
import { AppSidebar } from "@/components/app-sidebar"
import { AppTopbar } from "@/components/app-topbar"
import { getCurrentUser } from "@/server/auth/session"

export default async function AppLayout({ children }: { children: ReactNode }) {
  const currentUser = await getCurrentUser()
  const requestHeaders = await headers()
  const currentPath = requestHeaders.get("x-current-path") ?? ""

  // app 分组内的页面都属于登录后后台；没有有效 session 时在服务端拦截，避免页面闪现。
  if (!currentUser) {
    redirect("/login")
  }

  if (currentUser.passwordResetRequired && !currentPath.startsWith("/settings")) {
    // 强制改密必须在服务端拦截，避免客户端守卫加载前短暂看到后台页面内容。
    redirect("/settings?mustChangePassword=1")
  }

  return (
    <RoleProvider initialUser={currentUser}>
      <PasswordResetGuard />
      <SidebarProvider>
        <div className="flex h-screen overflow-hidden bg-background">
          <AppSidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <AppTopbar />
            <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
              <div className="mx-auto w-full max-w-6xl">{children}</div>
            </main>
          </div>
        </div>
      </SidebarProvider>
    </RoleProvider>
  )
}
