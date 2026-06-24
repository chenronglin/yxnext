import { type NextRequest } from "next/server"

import { getGovernanceProjectDetail } from "@/server/modules/admin/admin.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 项目治理详情依赖多表聚合，固定走 Node.js runtime。
export const runtime = "nodejs"

type ProjectRouteContext = {
  params: Promise<{
    projectId: string
  }>
}

export async function GET(request: NextRequest, context: ProjectRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { projectId } = await context.params
    const result = await getGovernanceProjectDetail(actor, projectId)

    return ok(result)
  } catch (error) {
    return fail(error, request)
  }
}
