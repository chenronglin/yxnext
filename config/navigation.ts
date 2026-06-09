import type { Role } from "@/types/domain"
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
  FileCheck2,
  BookMarked,
  type LucideIcon,
} from "lucide-react"

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
}

const adminNav: NavItem[] = [
  { label: "首页看板", href: "/dashboard", icon: LayoutDashboard },
  { label: "待我处理", href: "/todos", icon: ListChecks },
  { label: "项目治理", href: "/governance/projects", icon: FolderKanban },
  { label: "用户管理", href: "/admin/users", icon: Users },
  { label: "作者审批", href: "/admin/approvals", icon: UserCheck },
  { label: "编辑-作者绑定", href: "/admin/bindings", icon: Link2 },
  { label: "参数管理", href: "/admin/params", icon: Settings2 },
  { label: "统计报表", href: "/reports", icon: BarChart3 },
  { label: "通知中心", href: "/notifications", icon: Bell },
  { label: "AI 助手", href: "/ai", icon: Bot },
  { label: "个人设置", href: "/settings", icon: UserCog },
]

const editorNav: NavItem[] = [
  { label: "首页看板", href: "/dashboard", icon: LayoutDashboard },
  { label: "待我处理", href: "/todos", icon: ListChecks },
  { label: "SI 选题策划库", href: "/si", icon: Library },
  { label: "SI 预发记录", href: "/si/prereleases", icon: Send },
  { label: "我的项目", href: "/projects", icon: FolderKanban },
  { label: "审稿工作台", href: "/review", icon: FileCheck2 },
  { label: "通知中心", href: "/notifications", icon: Bell },
  { label: "AI 助手", href: "/ai", icon: Bot },
  { label: "个人设置", href: "/settings", icon: UserCog },
]

const authorNav: NavItem[] = [
  { label: "首页看板", href: "/dashboard", icon: LayoutDashboard },
  { label: "待我处理", href: "/todos", icon: ListChecks },
  { label: "我的 SI", href: "/my-si", icon: BookMarked },
  { label: "我的项目", href: "/projects", icon: FolderKanban },
  { label: "通知中心", href: "/notifications", icon: Bell },
  { label: "个人设置", href: "/settings", icon: UserCog },
]

export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  admin: adminNav,
  editor: editorNav,
  author: authorNav,
}
