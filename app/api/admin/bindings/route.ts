import { type NextRequest } from "next/server"
import { z } from "zod"

import { createBinding, listBindings } from "@/server/modules/admin/admin.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 绑定关系的增删都会落库并通知双方，固定在 Node.js runtime。
export const runtime = "nodejs"

const bindingSchema = z.object({
  editorId: z.string(),
  authorId: z.string(),
})

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiCurrentUser(request)
    const result = await listBindings(actor)

    return ok(result)
  } catch (error) {
    return fail(error, request)
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireApiCurrentUser(request)
    const body = bindingSchema.parse(await request.json().catch(() => ({})))
    const result = await createBinding(actor, body)

    return ok(result, { status: 201 })
  } catch (error) {
    return fail(error, request)
  }
}
