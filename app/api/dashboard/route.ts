import { type NextRequest } from "next/server"
import { z } from "zod"

import { getWorkspaceDashboard } from "@/server/modules/workbench/workbench.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 统一看板接口根据当前 session 角色返回不同统计结构，减少前端分散请求。
export const runtime = "nodejs"

const rangeSchema = z.enum(["7d", "30d", "90d", "all"])

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiCurrentUser(request)
    const range = rangeSchema.catch("30d").parse(request.nextUrl.searchParams.get("range") ?? "30d")
    const result = await getWorkspaceDashboard(actor, range)

    return ok(result)
  } catch (error) {
    return fail(error, request)
  }
}
