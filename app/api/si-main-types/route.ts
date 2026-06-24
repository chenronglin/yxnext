import { type NextRequest } from "next/server"

import { listActiveSiMainTypes } from "@/server/modules/si/si.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// SI 主类型是业务表单基础参数，只暴露启用项，不开放写入能力。
export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiCurrentUser(request)
    const result = await listActiveSiMainTypes(actor)

    return ok(result)
  } catch (error) {
    return fail(error, request)
  }
}
