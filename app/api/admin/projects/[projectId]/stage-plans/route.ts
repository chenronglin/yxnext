import { type NextRequest } from "next/server"
import { z } from "zod"

import { updateGovernanceProjectStagePlans } from "@/server/modules/admin/admin.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 项目阶段计划调整会更新 dueAt 和审计日志，固定使用 Node.js runtime。
export const runtime = "nodejs"

const stagePlansSchema = z.object({
  items: z.array(
    z.object({
      stage: z.enum(["synopsis", "outline", "chapter", "release"]),
      planDays: z.number().int(),
    }),
  ),
})

type StagePlansRouteContext = {
  params: Promise<{
    projectId: string
  }>
}

export async function PATCH(request: NextRequest, context: StagePlansRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { projectId } = await context.params
    const body = stagePlansSchema.parse(await request.json().catch(() => ({})))
    const result = await updateGovernanceProjectStagePlans(actor, projectId, body)

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}
