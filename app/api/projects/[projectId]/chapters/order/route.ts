import { type NextRequest } from "next/server"
import { z } from "zod"

import { reorderProjectChapters } from "@/server/modules/project/project.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 章节排序需要一次性重排全部 sortOrder，避免多次写入造成中间态错乱。
export const runtime = "nodejs"

const reorderSchema = z.object({
  orderedDocIds: z.array(z.string().trim().min(1, "章节 Doc ID 不能为空")).min(1, "排序列表不能为空"),
})

type ChapterOrderRouteContext = {
  params: Promise<{
    projectId: string
  }>
}

export async function PATCH(request: NextRequest, context: ChapterOrderRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { projectId } = await context.params
    const body = reorderSchema.parse(await request.json().catch(() => ({})))
    const result = await reorderProjectChapters(actor, projectId, body)

    return ok(result)
  } catch (error) {
    return fail(error, request)
  }
}
