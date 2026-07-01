import { type NextRequest } from "next/server"

import { getOpsOverview } from "@/server/modules/admin/ops.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 运维总览需要读取文件系统日志和 Prisma 数据，因此固定使用 Node.js runtime。
export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiCurrentUser(request)
    const overview = await getOpsOverview(actor)

    return ok(overview)
  } catch (error) {
    return fail(error, request)
  }
}
