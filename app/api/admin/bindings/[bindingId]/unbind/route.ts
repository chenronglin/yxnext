import { type NextRequest } from "next/server"

import { unbind } from "@/server/modules/admin/admin.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 解绑会影响 SI 预发作者可见范围，必须走数据库事务。
export const runtime = "nodejs"

type UnbindRouteContext = {
  params: Promise<{
    bindingId: string
  }>
}

export async function POST(request: NextRequest, context: UnbindRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { bindingId } = await context.params
    const result = await unbind(actor, bindingId)

    return ok(result)
  } catch (error) {
    return fail(error, request)
  }
}
