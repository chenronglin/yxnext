import { type NextRequest } from "next/server"
import { z } from "zod"

import { updateSiMetadataOptionParam } from "@/server/modules/admin/admin.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

export const runtime = "nodejs"

const optionSchema = z.object({
  category: z.enum(["si_type", "creative_difficulty"]).optional(),
  name: z.string().trim().min(1).max(100).optional(),
  value: z.string().trim().min(1).max(64).optional(),
  order: z.number().int().nonnegative().optional(),
  status: z.enum(["active", "inactive"]).optional(),
})

type OptionRouteContext = { params: Promise<{ optionId: string }> }

export async function PATCH(request: NextRequest, context: OptionRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { optionId } = await context.params
    const body = optionSchema.parse(await request.json().catch(() => ({})))
    return ok(await updateSiMetadataOptionParam(actor, optionId, body))
  } catch (error) {
    return fail(error, request)
  }
}
