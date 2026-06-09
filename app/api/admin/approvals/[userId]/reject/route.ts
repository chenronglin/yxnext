import { type NextRequest } from "next/server"
import { z } from "zod"

import { rejectApprovalRequest } from "@/server/modules/admin/admin.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 驳回会写原因、通知和审计，继续固定 Node.js runtime。
export const runtime = "nodejs"

const rejectSchema = z.object({
  reason: z.string(),
})

type RejectRouteContext = {
  params: Promise<{
    userId: string
  }>
}

export async function POST(request: NextRequest, context: RejectRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { userId } = await context.params
    const body = rejectSchema.parse(await request.json().catch(() => ({})))
    const result = await rejectApprovalRequest(actor, userId, body)

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}
