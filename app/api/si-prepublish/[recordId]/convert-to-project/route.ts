import { type NextRequest } from "next/server"
import { z } from "zod"

import { convertSiPreissueToProject } from "@/server/modules/si/si.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 转项目必须在服务层事务里完成项目、阶段计划、梗概 Doc、通知和审计写入。
export const runtime = "nodejs"

// 项目名称与 SI 名称是两个独立概念：前端会默认带出 SI 名称，接口仍需单独校验用户最终确认的项目名称。
// 保留 optional 是为了兼容尚未升级的调用方；缺省时服务层会回退到当前预发快照中的 SI 名称。
const convertToProjectSchema = z.object({
  projectTitle: z.string().trim().min(1, "项目名称不能为空").max(255, "项目名称不能超过 255 个字符").optional(),
})

type ConvertRouteContext = {
  params: Promise<{
    recordId: string
  }>
}

export async function POST(request: NextRequest, context: ConvertRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { recordId } = await context.params
    const body = convertToProjectSchema.parse(await request.json().catch(() => ({})))
    const result = await convertSiPreissueToProject(actor, recordId, body)

    return ok(result, { status: 201 })
  } catch (error) {
    return fail(error, request)
  }
}
