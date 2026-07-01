import type { Role } from "@/types/domain"
import type { I18nKey } from "@/lib/i18n/dictionary"
import {
  LayoutDashboard,
  ListChecks,
  FolderKanban,
  Users,
  UserCheck,
  Link2,
  Settings2,
  BarChart3,
  Bell,
  Bot,
  UserCog,
  Library,
  Send,
  BookMarked,
  ScrollText,
  Wrench,
  type LucideIcon,
} from "lucide-react"

export interface NavItem {
  labelKey: I18nKey
  href: string
  icon: LucideIcon
}

const adminNav: NavItem[] = [
  { labelKey: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard },
  { labelKey: "nav.todos", href: "/todos", icon: ListChecks },
  { labelKey: "nav.governanceProjects", href: "/governance/projects", icon: FolderKanban },
  { labelKey: "nav.users", href: "/admin/users", icon: Users },
  { labelKey: "nav.approvals", href: "/admin/approvals", icon: UserCheck },
  { labelKey: "nav.bindings", href: "/admin/bindings", icon: Link2 },
  { labelKey: "nav.params", href: "/admin/params", icon: Settings2 },
  { labelKey: "nav.audit", href: "/admin/audit", icon: ScrollText },
  { labelKey: "nav.ops", href: "/admin/ops", icon: Wrench },
  { labelKey: "nav.reports", href: "/reports", icon: BarChart3 },
  { labelKey: "nav.notifications", href: "/notifications", icon: Bell },
  { labelKey: "nav.ai", href: "/ai", icon: Bot },
  { labelKey: "nav.settings", href: "/settings", icon: UserCog },
]

const editorNav: NavItem[] = [
  { labelKey: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard },
  { labelKey: "nav.todos", href: "/todos", icon: ListChecks },
  { labelKey: "nav.siLibrary", href: "/si", icon: Library },
  { labelKey: "nav.siPrereleases", href: "/si/prereleases", icon: Send },
  { labelKey: "nav.myProjects", href: "/projects", icon: FolderKanban },
  { labelKey: "nav.notifications", href: "/notifications", icon: Bell },
  { labelKey: "nav.ai", href: "/ai", icon: Bot },
  { labelKey: "nav.settings", href: "/settings", icon: UserCog },
]

const authorNav: NavItem[] = [
  { labelKey: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard },
  { labelKey: "nav.todos", href: "/todos", icon: ListChecks },
  { labelKey: "nav.mySi", href: "/my-si", icon: BookMarked },
  { labelKey: "nav.myProjects", href: "/projects", icon: FolderKanban },
  { labelKey: "nav.notifications", href: "/notifications", icon: Bell },
  { labelKey: "nav.settings", href: "/settings", icon: UserCog },
]

export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  admin: adminNav,
  editor: editorNav,
  author: authorNav,
}
