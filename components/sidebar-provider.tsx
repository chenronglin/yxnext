"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"

interface SidebarContextValue {
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
  toggle: () => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsedState] = useState(false)

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

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed, toggle }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  const ctx = useContext(SidebarContext)
  if (!ctx) throw new Error("useSidebar 必须在 SidebarProvider 内使用")
  return ctx
}
