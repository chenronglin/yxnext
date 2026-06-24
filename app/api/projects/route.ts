import { type NextRequest } from "next/server"

import { listMyProjects } from "@/server/modules/project/project.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 我的项目列表依赖多表聚合和权限过滤，因此固定运行在 Node.js runtime。
export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiCurrentUser(request)
    const searchParams = request.nextUrl.searchParams
    const result = await listMyProjects(actor, {
      keyword: searchParams.get("keyword"),
      stage: searchParams.get("stage"),
      lifecycle: searchParams.get("lifecycle"),
      editorId: searchParams.get("editorId"),
      authorId: searchParams.get("authorId"),
      overdue: searchParams.get("overdue"),
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
    })

    return ok(result)
  } catch (error) {
    return fail(error, request)
  }
}
