import { type NextRequest } from "next/server"

import { listReviewQueue } from "@/server/modules/workbench/workbench.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 审稿工作台需要聚合待审 Doc、提交说明和预览文本，因此固定运行在 Node.js runtime。
export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiCurrentUser(request)
    const result = await listReviewQueue(actor)

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}
