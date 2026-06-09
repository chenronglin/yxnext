"use client"

import { createContext, useContext, type ReactNode } from "react"
import type { CurrentUser, Role } from "@/types/domain"

interface RoleContextValue {
  user: CurrentUser
  role: Role
}

const RoleContext = createContext<RoleContextValue | null>(null)

export function RoleProvider({
  children,
  initialUser,
}: {
  children: ReactNode
  initialUser: CurrentUser
}) {
  // 第 1 阶段开始，角色不再由前端演示切换器决定，而是来自服务端 session 查询出的 currentUser。
  return (
    <RoleContext.Provider value={{ user: initialUser, role: initialUser.role }}>
      {children}
    </RoleContext.Provider>
  )
}

export function useRole() {
  const ctx = useContext(RoleContext)
  if (!ctx) throw new Error("useRole 必须在 RoleProvider 内使用")
  return ctx
}
