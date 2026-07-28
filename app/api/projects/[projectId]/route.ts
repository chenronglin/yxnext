import { type NextRequest } from "next/server"
import { z } from "zod"

import { getProjectDetail, updateProjectTitle } from "@/server/modules/project/project.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 项目详情会读取阶段计划、Doc 摘要和章节统计，固定走 Node.js runtime。
export const runtime = "nodejs"

// 项目名称直接落在 Project.title，修改时不接收任何 SI 字段，保证两个名称不会被接口层隐式绑定。
const updateProjectTitleSchema = z.object({
  title: z.string().trim().min(1, "项目名称不能为空").max(255, "项目名称不能超过 255 个字符"),
})

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
    return fail(error, request)
  }
}

export async function PATCH(request: NextRequest, context: ProjectRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { projectId } = await context.params
    const body = updateProjectTitleSchema.parse(await request.json().catch(() => ({})))
    const result = await updateProjectTitle(actor, projectId, body)

    return ok(result)
  } catch (error) {
    return fail(error, request)
  }
}
