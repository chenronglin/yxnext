import type { ReactNode } from "react"
import { redirect } from "next/navigation"

import { requireServerCurrentUser } from "@/server/shared/current-user"

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // admin 分组下的页面全部属于管理员治理界面，非管理员直接回首页看板。
  const actor = await requireServerCurrentUser()

  if (actor.role !== "admin") {
    redirect("/dashboard")
  }

  return children
}
