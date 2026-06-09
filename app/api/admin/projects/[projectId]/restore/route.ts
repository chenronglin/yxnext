import { type NextRequest } from "next/server"

import { transitionGovernanceProject } from "@/server/modules/admin/admin.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 恢复项目会重新回到 active 生命周期，固定使用 Node.js runtime。
export const runtime = "nodejs"

type RestoreRouteContext = {
  params: Promise<{
    projectId: string
  }>
}

export async function POST(request: NextRequest, context: RestoreRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { projectId } = await context.params
    const result = await transitionGovernanceProject(actor, projectId, "restore")

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}
