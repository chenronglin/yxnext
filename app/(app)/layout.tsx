import type { ReactNode } from "react"
import { RoleProvider } from "@/components/role-provider"
import { AppSidebar } from "@/components/app-sidebar"
import { AppTopbar } from "@/components/app-topbar"

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RoleProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <AppTopbar />
          <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
            <div className="mx-auto w-full max-w-6xl">{children}</div>
          </main>
        </div>
      </div>
    </RoleProvider>
  )
}
