import { type NextRequest } from "next/server"

import { convertSiPreissueToProject } from "@/server/modules/si/si.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 转项目必须在服务层事务里完成项目、阶段计划、梗概 Doc、通知和审计写入。
export const runtime = "nodejs"

type ConvertRouteContext = {
  params: Promise<{
    recordId: string
  }>
}

export async function POST(request: NextRequest, context: ConvertRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { recordId } = await context.params
    const result = await convertSiPreissueToProject(actor, recordId)

    return ok(result, { status: 201 })
  } catch (error) {
    return fail(error)
  }
}
