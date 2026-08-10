import { type NextRequest } from "next/server"
import { z } from "zod"

import { updateStoryIdeaTitle } from "@/server/modules/si/si.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 标题修改会写入 SI 版本和审计日志，因此固定使用 Node.js runtime。
export const runtime = "nodejs"

// 专用路由只接收标题，避免已转项目的 SI 借此绕过正文与策划字段的冻结规则。
const updateStoryIdeaTitleSchema = z.object({
  title: z.string().trim().min(1, "SI 标题不能为空").max(255, "SI 标题不能超过 255 个字符"),
})

type SiTitleRouteContext = {
  params: Promise<{
    siId: string
  }>
}

export async function PATCH(request: NextRequest, context: SiTitleRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { siId } = await context.params
    const body = updateStoryIdeaTitleSchema.parse(await request.json().catch(() => ({})))
    const result = await updateStoryIdeaTitle(actor, siId, body)

    return ok(result)
  } catch (error) {
    return fail(error, request)
  }
}
