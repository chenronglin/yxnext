import { type NextRequest } from "next/server"

import { getProjectDocDirectory } from "@/server/modules/project/project.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 项目到 Doc 的索引关系只存在数据库主记录里，前端不能自行推导，因此单独暴露目录接口。
export const runtime = "nodejs"

type ProjectDocsRouteContext = {
  params: Promise<{
    projectId: string
  }>
}

export async function GET(request: NextRequest, context: ProjectDocsRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { projectId } = await context.params
    const result = await getProjectDocDirectory(actor, projectId)

    return ok(result)
  } catch (error) {
    return fail(error, request)
  }
}
