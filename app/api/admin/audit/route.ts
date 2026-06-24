import { type NextRequest } from "next/server"

import { listAuditLogs } from "@/server/modules/admin/admin.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 审计列表需要联表读取多类业务对象，保持 Node.js runtime。
export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiCurrentUser(request)
    const searchParams = request.nextUrl.searchParams
    const result = await listAuditLogs(actor, {
      keyword: searchParams.get("keyword"),
      action: searchParams.get("action"),
    })

    return ok(result)
  } catch (error) {
    return fail(error, request)
  }
}
