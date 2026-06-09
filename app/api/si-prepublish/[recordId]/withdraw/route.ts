import { type NextRequest } from "next/server"
import { z } from "zod"

import { withdrawSiPreissue } from "@/server/modules/si/si.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 收回预发会更新数据库状态并写审计日志，固定使用 Node.js runtime。
export const runtime = "nodejs"

const withdrawSchema = z.object({
  reason: z.string().optional().nullable(),
})

type WithdrawRouteContext = {
  params: Promise<{
    recordId: string
  }>
}

export async function POST(request: NextRequest, context: WithdrawRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { recordId } = await context.params
    const body = withdrawSchema.parse(await request.json().catch(() => ({})))
    const result = await withdrawSiPreissue(actor, recordId, body)

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}
