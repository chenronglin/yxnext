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

  // 当前稿件页需要同时容纳章节目录、正文和批注栏，因此单独使用整个后台内容宽度；
  // Clean 阅读、历史版本和普通业务页仍沿用 6xl 限宽，避免阅读行长和列表密度发生无关变化。
  const isCurrentDocWorkspace = /^\/projects\/\d+\/docs\/\d+\/?$/.test(currentPath)

  return (
    <RoleProvider initialUser={currentUser}>
      <PasswordResetGuard />
      <SidebarProvider>
        <div className="flex h-screen overflow-hidden bg-background">
          <AppSidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <AppTopbar />
            <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
              <div className={isCurrentDocWorkspace ? "mx-auto w-full max-w-none" : "mx-auto w-full max-w-6xl"}>
                {children}
              </div>
            </main>
          </div>
        </div>
      </SidebarProvider>
    </RoleProvider>
  )
}
