import { type NextRequest } from "next/server"

import { listSiPreissues } from "@/server/modules/si/si.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 预发记录列表同时服务编辑端和作者端；作者端隐藏已收回记录的规则在服务层执行。
export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiCurrentUser(request)
    const searchParams = request.nextUrl.searchParams
    const result = await listSiPreissues(actor, {
      keyword: searchParams.get("keyword"),
      status: searchParams.get("status"),
      authorId: searchParams.get("authorId"),
    })

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}
