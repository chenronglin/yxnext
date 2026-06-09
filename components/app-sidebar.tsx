"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BookOpenText } from "lucide-react"
import { cn } from "@/lib/utils"
import { useRole } from "@/components/role-provider"
import { NAV_BY_ROLE } from "@/lib/navigation"
import { ROLE_LABELS } from "@/lib/types"

export function AppSidebar() {
  const pathname = usePathname()
  const { role } = useRole()
  const items = NAV_BY_ROLE[role]

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-5">
        <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <BookOpenText className="size-5" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-sidebar-foreground">阅享</span>
          <span className="text-[11px] text-muted-foreground">协作管理与审稿平台</span>
        </div>
      </div>

      <div className="px-5 py-3">
        <span className="inline-flex items-center rounded-md bg-sidebar-accent px-2 py-0.5 text-xs font-medium text-sidebar-accent-foreground">
          {ROLE_LABELS[role]}视图
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <ul className="flex flex-col gap-0.5">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/")
            const Icon = item.icon
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}
