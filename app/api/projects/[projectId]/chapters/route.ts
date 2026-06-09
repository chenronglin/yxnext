import { type NextRequest } from "next/server"
import { z } from "zod"

import { createProjectChapter, listProjectChapters } from "@/server/modules/project/project.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 正文章节列表和创建都属于项目协作核心能力，需要事务和权限判断，固定走 Node.js runtime。
export const runtime = "nodejs"

const createChapterSchema = z.object({
  title: z.string().trim().min(1, "章节标题不能为空"),
  chapterNo: z.number().int().positive().nullable().optional(),
})

type ChaptersRouteContext = {
  params: Promise<{
    projectId: string
  }>
}

export async function GET(request: NextRequest, context: ChaptersRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { projectId } = await context.params
    const result = await listProjectChapters(actor, projectId)

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}

export async function POST(request: NextRequest, context: ChaptersRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { projectId } = await context.params
    const body = createChapterSchema.parse(await request.json().catch(() => ({})))
    const result = await createProjectChapter(actor, projectId, body)

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}
