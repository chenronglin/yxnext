import { type NextRequest } from "next/server"

import { markAllTodosRead } from "@/server/modules/workbench/workbench.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 待办“批量标记已读”只更新当前用户自己的 todo_items.is_read / read_at，因此单独拆集合级路由。
export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    const actor = await requireApiCurrentUser(request)
    const result = await markAllTodosRead(actor)

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}
