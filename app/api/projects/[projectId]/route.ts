import { type NextRequest } from "next/server"

import { getProjectDetail } from "@/server/modules/project/project.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 项目详情会读取阶段计划、Doc 摘要和章节统计，固定走 Node.js runtime。
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
    const result = await getProjectDetail(actor, projectId)

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}
