"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Bell, LogOut, Menu } from "lucide-react"
import { LanguageSwitcher } from "@/components/i18n/language-switcher"
import { useRole } from "@/components/role-provider"
import { useSidebar } from "@/components/sidebar-provider"
import { ROLE_LABEL_KEYS } from "@/types/domain"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { fetchJson } from "@/lib/api"
import { useT } from "@/hooks/use-t"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type NotificationsBadgeResponse = {
  unreadCount: number
}

export function AppTopbar() {
  const t = useT()
  const router = useRouter()
  const { user } = useRole()
  const { collapsed, toggleForViewport } = useSidebar()
  const [loggingOut, setLoggingOut] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    // 顶栏只关心未读数量；完整通知列表仍由通知中心页面负责展示。
    void fetchJson<NotificationsBadgeResponse>("/api/notifications")
      .then((response) => setUnreadCount(response.unreadCount))
      .catch(() => {
        setUnreadCount(0)
      })
  }, [])

  async function handleLogout() {
    if (loggingOut) return

    setLoggingOut(true)

    // 退出必须调用后端撤销 user_sessions，不能只做前端跳转。
    await fetch("/api/auth/logout", {
      method: "POST",
    }).catch(() => {
      // 即使网络异常，也跳回登录页；服务端布局会继续兜底检查 session 是否仍有效。
    })

    router.replace("/login")
    router.refresh()
  }

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border bg-background px-4 md:px-6">
      <div className="flex flex-1 items-center gap-3">
        <button
          onClick={toggleForViewport}
          className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary transition-colors"
          title={collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
          aria-label={collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
        >
          <Menu className="size-5" />
        </button>
      </div>

      {/* 顶栏右侧不再重复展示角色徽标，改为放置语言切换器，方便用户随时切换中英文界面。 */}
      <LanguageSwitcher compact />

      <Link
        href="/notifications"
        className="relative inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary"
        aria-label={t("nav.notificationAria")}
      >
        <Bell className="size-5" />
        {unreadCount > 0 && <span className="absolute right-2 top-2 size-2 rounded-full bg-destructive" />}
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-secondary">
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary text-xs text-primary-foreground">
              {user.name.slice(0, 1)}
            </AvatarFallback>
          </Avatar>
          <div className="hidden flex-col items-start leading-tight sm:flex">
            <span className="text-sm font-medium text-foreground">{user.name}</span>
            <span className="text-[11px] text-muted-foreground">{t(ROLE_LABEL_KEYS[user.role])}</span>
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{user.username}</DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/settings">{t("nav.settings")}</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => void handleLogout()}>
            <LogOut className="mr-2 size-4" />
            {loggingOut ? t("nav.loggingOut") : t("nav.logout")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
