import { type NextRequest } from "next/server"
import { z } from "zod"

import { createSiMainTypeParam, listSiMainTypeParams } from "@/server/modules/admin/admin.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// SI 主类型参数直接影响业务表单下拉，固定使用 Node.js runtime。
export const runtime = "nodejs"

const siMainTypeSchema = z.object({
  name: z.string().optional(),
  value: z.string().optional(),
  order: z.number().int().optional(),
  status: z.enum(["active", "inactive"]).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiCurrentUser(request)
    const result = await listSiMainTypeParams(actor)

    return ok(result)
  } catch (error) {
    return fail(error, request)
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireApiCurrentUser(request)
    const body = siMainTypeSchema.parse(await request.json().catch(() => ({})))
    const result = await createSiMainTypeParam(actor, body)

    return ok(result, { status: 201 })
  } catch (error) {
    return fail(error, request)
  }
}
