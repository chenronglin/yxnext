"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BookOpenText, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { useRole } from "@/components/role-provider"
import { useSidebar } from "@/components/sidebar-provider"
import { NAV_BY_ROLE } from "@/config/navigation"
import { useT } from "@/hooks/use-t"

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
  const t = useT()
  const pathname = usePathname()
  const { role } = useRole()
  const { collapsed, mobileOpen, setMobileOpen, toggle } = useSidebar()
  const items = NAV_BY_ROLE[role]
  const allHrefs = items.map((item) => item.href)

  const navList = (mode: "desktop" | "mobile") => (
    <nav className="flex-1 overflow-y-auto px-3 pb-4 pt-3">
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => {
          const active = isNavItemActive(pathname, item.href, allHrefs)
          const Icon = item.icon
          const compact = mode === "desktop" && collapsed
          const label = t(item.labelKey)

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                title={compact ? label : undefined}
                onClick={() => mode === "mobile" && setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  compact ? "mx-auto size-10 justify-center px-0" : "",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {!compact && <span className="truncate animate-in fade-in duration-300">{label}</span>}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            aria-label={t("nav.closeNavigation")}
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar shadow-xl">
            <div className="flex h-16 items-center gap-2 overflow-hidden border-b border-sidebar-border px-5">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <BookOpenText className="size-5" />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-semibold text-sidebar-foreground">{t("brand.name")}</span>
                <span className="whitespace-nowrap text-[11px] text-muted-foreground">{t("brand.shortTagline")}</span>
              </div>
            </div>
            {navList("mobile")}
          </aside>
        </div>
      )}

      <aside
        className={cn(
          "hidden shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar transition-[width] duration-300 ease-in-out md:flex",
          collapsed ? "w-[70px]" : "w-60",
        )}
      >
      {/* 侧栏头部展示品牌入口，文案跟随当前语言切换。 */}
      <div
        className={cn(
          "flex h-16 items-center border-b border-sidebar-border px-5 gap-2 overflow-hidden",
          collapsed ? "justify-center px-0" : "",
        )}
      >
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <BookOpenText className="size-5" />
        </div>
        {!collapsed && (
          <div className="flex flex-col leading-tight animate-in fade-in duration-300">
            <span className="text-sm font-semibold text-sidebar-foreground">{t("brand.name")}</span>
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
              {t("brand.shortTagline")}
            </span>
          </div>
        )}
      </div>

      {/* 导航项只保存稳定 key，渲染时按当前语言转成展示文案。 */}
      {navList("desktop")}

      {/* 折叠按钮只改变侧栏宽度，不改变当前路由。 */}
      <div className="mt-auto border-t border-sidebar-border p-3 flex justify-center">
        <button
          onClick={toggle}
          className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          title={collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
          aria-label={collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
        >
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
        </button>
      </div>
      </aside>
    </>
  )
}
