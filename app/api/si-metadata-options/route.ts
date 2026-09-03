import { type NextRequest } from "next/server"

import { listActiveSiMetadataOptions } from "@/server/modules/si/si.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiCurrentUser(request)
    return ok(await listActiveSiMetadataOptions(actor))
  } catch (error) {
    return fail(error, request)
  }
}
