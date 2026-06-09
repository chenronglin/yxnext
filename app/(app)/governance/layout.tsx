import type { ReactNode } from "react"
import { redirect } from "next/navigation"

import { requireServerCurrentUser } from "@/server/shared/current-user"

export default async function GovernanceLayout({ children }: { children: ReactNode }) {
  // 项目治理页只开放给管理员，编辑和作者即使知道路径也不能进入。
  const actor = await requireServerCurrentUser()

  if (actor.role !== "admin") {
    redirect("/dashboard")
  }

  return children
}
