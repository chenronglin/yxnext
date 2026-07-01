import { type NextRequest } from "next/server"
import { z } from "zod"

import { truncateRuntimeLog } from "@/server/modules/admin/ops.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 日志截断只处理项目根目录下的安全 .log 文件，服务层会再次校验文件名和真实路径。
export const runtime = "nodejs"

const truncateSchema = z.object({
  fileName: z.string().min(1),
})

export async function POST(request: NextRequest) {
  try {
    const actor = await requireApiCurrentUser(request)
    const body = await request.json().catch(() => ({}))
    const input = truncateSchema.parse(body)
    const result = await truncateRuntimeLog(actor, input)

    return ok(result)
  } catch (error) {
    return fail(error, request)
  }
}
