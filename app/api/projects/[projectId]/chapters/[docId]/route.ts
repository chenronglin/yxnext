import { type NextRequest } from "next/server"
import { z } from "zod"

import { deleteProjectChapter, updateProjectChapterMetadata } from "@/server/modules/project/project.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 单个章节路由统一承载章节元数据修改与软删除；两种操作都必须经过项目权限和质检阶段锁定校验。
export const runtime = "nodejs"

const updateChapterMetadataSchema = z.object({
  title: z.string().trim().min(1, "章节标题不能为空"),
  chapterNo: z.number().int().positive("章节号必须是正整数"),
})

type ChapterRouteContext = {
  params: Promise<{
    projectId: string
    docId: string
  }>
}

export async function PATCH(request: NextRequest, context: ChapterRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { projectId, docId } = await context.params
    const body = updateChapterMetadataSchema.parse(await request.json().catch(() => ({})))
    const result = await updateProjectChapterMetadata(actor, projectId, docId, body)

    return ok(result)
  } catch (error) {
    return fail(error, request)
  }
}

export async function DELETE(request: NextRequest, context: ChapterRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { projectId, docId } = await context.params
    const result = await deleteProjectChapter(actor, projectId, docId)

    return ok(result)
  } catch (error) {
    return fail(error, request)
  }
}
