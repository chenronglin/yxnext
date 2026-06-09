import { type NextRequest } from "next/server"
import { z } from "zod"

import { getAdminDashboard } from "@/server/modules/admin/admin.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 管理端看板依赖数据库实时统计，必须固定在 Node.js runtime 下执行。
export const runtime = "nodejs"

const rangeSchema = z.enum(["7d", "30d", "90d", "all"])

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiCurrentUser(request)
    const range = rangeSchema.catch("30d").parse(request.nextUrl.searchParams.get("range") ?? "30d")
    const result = await getAdminDashboard(actor, range)

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}
