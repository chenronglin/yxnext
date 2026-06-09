import { type NextRequest } from "next/server"

import { transitionGovernanceProject } from "@/server/modules/admin/admin.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 项目归档会改变生命周期并进入只读治理状态，固定使用 Node.js runtime。
export const runtime = "nodejs"

type ArchiveRouteContext = {
  params: Promise<{
    projectId: string
  }>
}

export async function POST(request: NextRequest, context: ArchiveRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { projectId } = await context.params
    const result = await transitionGovernanceProject(actor, projectId, "archive")

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}
