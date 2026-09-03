import { type NextRequest } from "next/server"
import { z } from "zod"

import {
  createSiMetadataOptionParam,
  listSiMetadataOptionParams,
} from "@/server/modules/admin/admin.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

export const runtime = "nodejs"

const optionSchema = z.object({
  category: z.enum(["si_type", "creative_difficulty"]),
  name: z.string().trim().min(1).max(100),
  value: z.string().trim().min(1).max(64),
  order: z.number().int().nonnegative().optional(),
  status: z.enum(["active", "inactive"]).optional(),
})

export async function GET(request: NextRequest) {
  try {
    return ok(await listSiMetadataOptionParams(await requireApiCurrentUser(request)))
  } catch (error) {
    return fail(error, request)
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireApiCurrentUser(request)
    const body = optionSchema.parse(await request.json().catch(() => ({})))
    return ok(await createSiMetadataOptionParam(actor, body), { status: 201 })
  } catch (error) {
    return fail(error, request)
  }
}
