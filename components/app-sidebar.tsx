"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BookOpenText, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { useRole } from "@/components/role-provider"
import { useSidebar } from "@/components/sidebar-provider"
import { NAV_BY_ROLE } from "@/config/navigation"
import { ROLE_LABELS } from "@/types/domain"

function isNavItemActive(pathname: string, href: string, allHrefs: string[]) {
  // 先判断当前菜单自身是否命中：支持精确命中和“详情页仍归属当前菜单”的子路径命中。
  const matchesCurrent = pathname === href || pathname.startsWith(`${href}/`)

  if (!matchesCurrent) {
    return false
  }

  // 当多个菜单存在父子前缀关系时，必须优先把高亮归给更具体的那一项。
  // 例如 `/si/prereleases` 既会命中 `/si`，也会命中 `/si/prereleases`；
  // 此时应该只高亮后者，避免两个菜单同时处于 active 状态。
  const matchedLongerHref = allHrefs.some((candidateHref) => {
    if (candidateHref === href) {
      return false
    }

    const matchesCandidate =
      pathname === candidateHref || pathname.startsWith(`${candidateHref}/`)

    return matchesCandidate && candidateHref.length > href.length
  })

  return !matchedLongerHref
}

export function AppSidebar() {
  const pathname = usePathname()
  const { role } = useRole()
  const { collapsed, toggle } = useSidebar()
  const items = NAV_BY_ROLE[role]
  const allHrefs = items.map((item) => item.href)

  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex transition-[width] duration-300 ease-in-out overflow-hidden",
        collapsed ? "w-[70px]" : "w-60"
      )}
    >
      {/* Header (Logo & Title) */}
      <div
        className={cn(
          "flex h-16 items-center border-b border-sidebar-border px-5 gap-2 overflow-hidden",
          collapsed ? "justify-center px-0" : ""
        )}
      >
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <BookOpenText className="size-5" />
        </div>
        {!collapsed && (
          <div className="flex flex-col leading-tight animate-in fade-in duration-300">
            <span className="text-sm font-semibold text-sidebar-foreground">阅享</span>
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
              协作管理与审稿平台
            </span>
          </div>
        )}
      </div>

      {/* Role Label */}
      {!collapsed ? (
        <div className="px-5 py-3 animate-in fade-in duration-300">
          <span className="inline-flex items-center rounded-md bg-sidebar-accent px-2 py-0.5 text-xs font-medium text-sidebar-accent-foreground">
            {ROLE_LABELS[role]}视图
          </span>
        </div>
      ) : (
        <div className="h-4" />
      )}

      {/* Navigation Menu */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <ul className="flex flex-col gap-0.5">
          {items.map((item) => {
            const active = isNavItemActive(pathname, item.href, allHrefs)
            const Icon = item.icon
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    collapsed ? "justify-center px-0 size-10 mx-auto" : "",
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {!collapsed && (
                    <span className="truncate animate-in fade-in duration-300">{item.label}</span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Collapse Toggle Button */}
      <div className="mt-auto border-t border-sidebar-border p-3 flex justify-center">
        <button
          onClick={toggle}
          className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          title={collapsed ? "展开侧栏" : "收起侧栏"}
          aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
        >
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
        </button>
      </div>
    </aside>
  )
}
