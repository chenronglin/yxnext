import { type NextRequest } from "next/server"

import { getAccountBindings } from "@/server/modules/account/account.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 绑定信息页是当前用户的协作关系自助查询接口，不涉及跨用户读取。
export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    // 个人设置页展示绑定摘要时不应因为“待改密”而完全空白，
    // 因此读取绑定信息的 GET 接口也需要在这一阶段保持可用。
    const actor = await requireApiCurrentUser(request, { allowPasswordResetRequired: true })
    const result = await getAccountBindings(actor)

    return ok(result)
  } catch (error) {
    return fail(error, request)
  }
}
