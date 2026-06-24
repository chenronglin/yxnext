import { type NextRequest } from "next/server"

import { deleteProjectChapter } from "@/server/modules/project/project.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 删除章节采用软删除，避免破坏既有审计和关联记录，因此需要单独的章节路由。
export const runtime = "nodejs"

type ChapterRouteContext = {
  params: Promise<{
    projectId: string
    docId: string
  }>
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
