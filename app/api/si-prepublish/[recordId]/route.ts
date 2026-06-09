import { type NextRequest } from "next/server"

import { getSiPreissue } from "@/server/modules/si/si.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 单条预发详情用于作者端只读查看；权限和收回隐藏逻辑由服务层兜底。
export const runtime = "nodejs"

type PreissueRouteContext = {
  params: Promise<{
    recordId: string
  }>
}

export async function GET(request: NextRequest, context: PreissueRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { recordId } = await context.params
    const result = await getSiPreissue(actor, recordId)

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}
