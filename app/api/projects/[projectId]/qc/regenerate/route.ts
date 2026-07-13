import { type NextRequest } from "next/server"

import { regenerateProjectQc } from "@/server/modules/project/project.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 重新质检会覆盖当前活动质检稿、重置审核状态并刷新来源章节快照，因此必须在服务层事务中完成。
export const runtime = "nodejs"

type QcRegenerateRouteContext = {
  params: Promise<{
    projectId: string
  }>
}

export async function POST(request: NextRequest, context: QcRegenerateRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { projectId } = await context.params
    const result = await regenerateProjectQc(actor, projectId)

    return ok(result)
  } catch (error) {
    return fail(error, request)
  }
}
