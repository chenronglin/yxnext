"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"

interface SidebarContextValue {
  collapsed: boolean
  mobileOpen: boolean
  setCollapsed: (collapsed: boolean) => void
  setMobileOpen: (open: boolean) => void
  toggle: () => void
  toggleForViewport: () => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsedState] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed")
    if (saved === "true") {
      setCollapsedState(true)
    }
  }, [])

  const setCollapsed = (val: boolean) => {
    setCollapsedState(val)
    localStorage.setItem("sidebar-collapsed", String(val))
  }

  const toggle = () => {
    setCollapsed(!collapsed)
  }

  const toggleForViewport = () => {
    // md 以下没有固定侧栏，汉堡按钮应打开抽屉；md 以上继续执行原来的折叠/展开逻辑。
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      setMobileOpen((open) => !open)
      return
    }

    toggle()
  }

  return (
    <SidebarContext.Provider value={{ collapsed, mobileOpen, setCollapsed, setMobileOpen, toggle, toggleForViewport }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  const ctx = useContext(SidebarContext)
  if (!ctx) throw new Error("useSidebar 必须在 SidebarProvider 内使用")
  return ctx
}
