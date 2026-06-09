import { type NextRequest } from "next/server"

import { transitionGovernanceProject } from "@/server/modules/admin/admin.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 标记项目完成会改生命周期与阶段状态，固定使用 Node.js runtime。
export const runtime = "nodejs"

type CompleteRouteContext = {
  params: Promise<{
    projectId: string
  }>
}

export async function POST(request: NextRequest, context: CompleteRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { projectId } = await context.params
    const result = await transitionGovernanceProject(actor, projectId, "complete")

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}
