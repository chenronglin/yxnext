import { type NextRequest } from "next/server"
import { z } from "zod"

import { updateSiMainTypeParam } from "@/server/modules/admin/admin.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 参数更新依赖 Prisma 写库，固定 Node.js runtime。
export const runtime = "nodejs"

const siMainTypeSchema = z.object({
  name: z.string().optional(),
  value: z.string().optional(),
  order: z.number().int().optional(),
  status: z.enum(["active", "inactive"]).optional(),
})

type MainTypeRouteContext = {
  params: Promise<{
    mainTypeId: string
  }>
}

export async function PATCH(request: NextRequest, context: MainTypeRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { mainTypeId } = await context.params
    const body = siMainTypeSchema.parse(await request.json().catch(() => ({})))
    const result = await updateSiMainTypeParam(actor, mainTypeId, body)

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}
