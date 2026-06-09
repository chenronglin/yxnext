import { type NextRequest } from "next/server"
import { z } from "zod"

import { getWorkspaceReport } from "@/server/modules/workbench/workbench.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 统一报表接口与看板类似，按当前角色输出对应的真实统计数据。
export const runtime = "nodejs"

const rangeSchema = z.enum(["7d", "30d", "90d", "all"])

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiCurrentUser(request)
    const range = rangeSchema.catch("30d").parse(request.nextUrl.searchParams.get("range") ?? "30d")
    const result = await getWorkspaceReport(actor, range)

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}
