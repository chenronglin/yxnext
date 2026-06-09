import { type NextRequest } from "next/server"
import { z } from "zod"

import { prepublishStoryIdea } from "@/server/modules/si/si.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 预发会写入预发记录、通知和审计日志，固定使用 Node.js runtime。
export const runtime = "nodejs"

const idSchema = z.union([z.string(), z.number(), z.bigint()])

const prepublishSchema = z.object({
  authorIds: z.array(idSchema).min(1, "请选择预发作者"),
  note: z.string().optional().nullable(),
})

type PrepublishRouteContext = {
  params: Promise<{
    siId: string
  }>
}

export async function POST(request: NextRequest, context: PrepublishRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { siId } = await context.params
    const body = prepublishSchema.parse(await request.json().catch(() => ({})))
    const result = await prepublishStoryIdea(actor, siId, body)

    return ok(result, { status: 201 })
  } catch (error) {
    return fail(error)
  }
}
