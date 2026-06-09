import { type NextRequest } from "next/server"
import { z } from "zod"

import { createManagedUser, listManagedUsers } from "@/server/modules/admin/admin.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 用户治理涉及密码加密和数据库写入，只能跑在 Node.js runtime。
export const runtime = "nodejs"

const managedUserSchema = z.object({
  username: z.string().optional(),
  name: z.string().optional(),
  role: z.enum(["admin", "editor", "author"]).optional(),
  email: z.string().optional(),
  phone: z.string().optional().nullable(),
  password: z.string().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiCurrentUser(request)
    const result = await listManagedUsers(actor)

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireApiCurrentUser(request)
    const body = managedUserSchema.parse(await request.json().catch(() => ({})))
    const result = await createManagedUser(actor, body)

    return ok(result, { status: 201 })
  } catch (error) {
    return fail(error)
  }
}
