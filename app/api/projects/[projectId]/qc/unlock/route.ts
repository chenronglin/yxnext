import { type NextRequest } from "next/server"

import { unlockProjectQc } from "@/server/modules/project/project.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 质检解锁会创建/初始化 Release Doc、写来源快照并推进项目阶段，必须走事务。
export const runtime = "nodejs"

type QcUnlockRouteContext = {
  params: Promise<{
    projectId: string
  }>
}

export async function POST(request: NextRequest, context: QcUnlockRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { projectId } = await context.params
    const result = await unlockProjectQc(actor, projectId)

    return ok(result)
  } catch (error) {
    return fail(error, request)
  }
}
