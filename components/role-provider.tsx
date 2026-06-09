"use client"

import { createContext, useContext, useState, useCallback, type ReactNode } from "react"
import type { CurrentUser, Role } from "@/lib/types"

const DEMO_USERS: Record<Role, CurrentUser> = {
  admin: {
    id: "u-admin",
    username: "admin",
    name: "平台管理员",
    role: "admin",
    status: "active",
    email: "admin@yuexiang.com",
    phone: "138****0001",
  },
  editor: {
    id: "u-editor",
    username: "editor_lin",
    name: "林编辑",
    role: "editor",
    status: "active",
    email: "lin@yuexiang.com",
    phone: "138****0002",
  },
  author: {
    id: "u-author",
    username: "author_su",
    name: "苏小白",
    role: "author",
    status: "active",
    email: "su@yuexiang.com",
    phone: "138****0003",
  },
}

interface RoleContextValue {
  user: CurrentUser
  role: Role
  setRole: (role: Role) => void
}

const RoleContext = createContext<RoleContextValue | null>(null)

export function RoleProvider({ children, initialRole = "editor" }: { children: ReactNode; initialRole?: Role }) {
  const [role, setRoleState] = useState<Role>(initialRole)

  const setRole = useCallback((next: Role) => {
    setRoleState(next)
  }, [])

  return <RoleContext.Provider value={{ user: DEMO_USERS[role], role, setRole }}>{children}</RoleContext.Provider>
}

export function useRole() {
  const ctx = useContext(RoleContext)
  if (!ctx) throw new Error("useRole 必须在 RoleProvider 内使用")
  return ctx
}
