import { type NextRequest } from "next/server"

import { completeProject } from "@/server/modules/project/project.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 编辑侧项目完成动作需要校验质检通过状态，并同步推进生命周期，因此固定走 Node.js runtime。
export const runtime = "nodejs"

type ProjectCompleteRouteContext = {
  params: Promise<{
    projectId: string
  }>
}

export async function POST(request: NextRequest, context: ProjectCompleteRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { projectId } = await context.params
    const result = await completeProject(actor, projectId)

    return ok(result)
  } catch (error) {
    return fail(error, request)
  }
}
