import { type NextRequest } from "next/server"

import { listBoundAuthors } from "@/server/modules/si/si.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 预发弹窗需要实时读取编辑绑定作者，固定使用 Node.js runtime 访问数据库。
export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiCurrentUser(request)
    const result = await listBoundAuthors(actor)

    return ok(result)
  } catch (error) {
    return fail(error, request)
  }
}
