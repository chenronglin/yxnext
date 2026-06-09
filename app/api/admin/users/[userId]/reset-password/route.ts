import { type NextRequest } from "next/server"

import { resetManagedUserPassword } from "@/server/modules/admin/admin.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 重置密码要重新计算 hash，因此保持 Node.js runtime。
export const runtime = "nodejs"

type ResetPasswordRouteContext = {
  params: Promise<{
    userId: string
  }>
}

export async function POST(request: NextRequest, context: ResetPasswordRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { userId } = await context.params
    const result = await resetManagedUserPassword(actor, userId)

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}
