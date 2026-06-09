import { type NextRequest } from "next/server"

import { getAccountBindings } from "@/server/modules/account/account.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 绑定信息页是当前用户的协作关系自助查询接口，不涉及跨用户读取。
export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiCurrentUser(request)
    const result = await getAccountBindings(actor)

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}
