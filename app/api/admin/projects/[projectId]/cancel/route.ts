import { type NextRequest } from "next/server"

import { transitionGovernanceProject } from "@/server/modules/admin/admin.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 取消项目同样会写治理审计，固定使用 Node.js runtime。
export const runtime = "nodejs"

type CancelRouteContext = {
  params: Promise<{
    projectId: string
  }>
}

export async function POST(request: NextRequest, context: CancelRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { projectId } = await context.params
    const result = await transitionGovernanceProject(actor, projectId, "cancel")

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}
