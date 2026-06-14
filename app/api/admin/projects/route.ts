import { type NextRequest } from "next/server"

import { listGovernanceProjects } from "@/server/modules/admin/admin.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 项目治理列表需要读取项目、阶段计划、文档摘要等聚合数据，固定 Node.js runtime。
export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiCurrentUser(request)
    const searchParams = request.nextUrl.searchParams
    const result = await listGovernanceProjects(actor, {
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
    return fail(error)
  }
}
