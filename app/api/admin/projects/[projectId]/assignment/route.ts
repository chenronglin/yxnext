import { type NextRequest } from "next/server"
import { z } from "zod"

import { updateGovernanceProjectAssignment } from "@/server/modules/admin/admin.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 项目归属调整要同时写归属日志和通知，固定使用 Node.js runtime。
export const runtime = "nodejs"

const assignmentSchema = z.object({
  editorId: z.string().optional(),
  authorId: z.string().optional(),
  reason: z.string().optional().nullable(),
})

type AssignmentRouteContext = {
  params: Promise<{
    projectId: string
  }>
}

export async function PATCH(request: NextRequest, context: AssignmentRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { projectId } = await context.params
    const body = assignmentSchema.parse(await request.json().catch(() => ({})))
    const result = await updateGovernanceProjectAssignment(actor, projectId, body)

    return ok(result)
  } catch (error) {
    return fail(error, request)
  }
}
