import { type NextRequest } from "next/server"
import { z } from "zod"

import { getAdminReport } from "@/server/modules/admin/admin.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 统计报表同样走 Prisma 聚合查询，保持 Node.js runtime。
export const runtime = "nodejs"

const rangeSchema = z.enum(["7d", "30d", "90d", "all"])

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiCurrentUser(request)
    const range = rangeSchema.catch("30d").parse(request.nextUrl.searchParams.get("range") ?? "30d")
    const result = await getAdminReport(actor, range)

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}
