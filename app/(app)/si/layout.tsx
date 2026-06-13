import type { ReactNode } from "react"
import { redirect } from "next/navigation"

import { requireServerCurrentUser } from "@/server/shared/current-user"

export default async function SiLayout({ children }: { children: ReactNode }) {
  const actor = await requireServerCurrentUser()

  // SI 选题策划库属于编辑侧工作台；作者只能从“我的 SI”查看预发给自己的记录。
  if (actor.role === "author") {
    redirect("/dashboard")
  }

  return children
}
