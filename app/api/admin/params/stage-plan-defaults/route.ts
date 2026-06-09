import { type NextRequest } from "next/server"
import { z } from "zod"

import { listStagePlanDefaults, updateStagePlanDefaults } from "@/server/modules/admin/admin.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 阶段默认计划配置会反向影响项目创建时的计划初始化，固定使用 Node.js runtime。
export const runtime = "nodejs"

const stagePlanDefaultsSchema = z.object({
  items: z.array(
    z.object({
      stage: z.enum(["synopsis", "outline", "manuscript", "qc"]),
      days: z.number().int(),
      warningDaysBeforeDue: z.number().int().optional(),
    }),
  ),
})

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiCurrentUser(request)
    const result = await listStagePlanDefaults(actor)

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await requireApiCurrentUser(request)
    const body = stagePlanDefaultsSchema.parse(await request.json().catch(() => ({})))
    const result = await updateStagePlanDefaults(actor, body)

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}
