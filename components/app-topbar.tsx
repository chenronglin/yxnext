"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Search, Bell, LogOut, Menu, Languages } from "lucide-react"
import { useRole } from "@/components/role-provider"
import { useSidebar } from "@/components/sidebar-provider"
import { ROLE_LABELS } from "@/types/domain"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu"

export function AppTopbar() {
  const router = useRouter()
  const { user, role } = useRole()
  const { collapsed, toggle } = useSidebar()
  const [lang, setLang] = useState("zh")
  const [loggingOut, setLoggingOut] = useState(false)

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
          onClick={toggle}
          className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary transition-colors"
          title={collapsed ? "展开侧栏" : "收起侧栏"}
          aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
        >
          <Menu className="size-5" />
        </button>
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="搜索项目、SI、稿件、用户…"
            className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
          />
        </div>
      </div>

      <span className="hidden rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground sm:inline-flex">
        {ROLE_LABELS[role]}
      </span>

      {/* 演示用：多语言切换器 */}
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary" aria-label="选择语言">
          <Languages className="size-5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuRadioGroup value={lang} onValueChange={setLang}>
            <DropdownMenuLabel>选择语言 / Language</DropdownMenuLabel>
            <DropdownMenuRadioItem value="zh">简体中文</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Link
        href="/notifications"
        className="relative inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary"
        aria-label="通知"
      >
        <Bell className="size-5" />
        <span className="absolute right-2 top-2 size-2 rounded-full bg-destructive" />
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
            <span className="text-[11px] text-muted-foreground">{ROLE_LABELS[user.role]}</span>
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{user.username}</DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/settings">个人设置</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => void handleLogout()}>
            <LogOut className="mr-2 size-4" />
            {loggingOut ? "正在退出" : "退出登录"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
