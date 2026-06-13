import type { ReactNode } from "react"
import { redirect } from "next/navigation"

import { requireServerCurrentUser } from "@/server/shared/current-user"

export default async function ReviewLayout({ children }: { children: ReactNode }) {
  const actor = await requireServerCurrentUser()

  // 审稿工作台只面向编辑和管理员；作者通过待办/项目进入自己持有的稿件。
  if (actor.role === "author") {
    redirect("/dashboard")
  }

  return children
}
