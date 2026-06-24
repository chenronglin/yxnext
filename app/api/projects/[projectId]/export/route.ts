import { type NextRequest } from "next/server"
import { z } from "zod"

import { exportProjectContent } from "@/server/modules/project/project.service"
import { fail } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 项目导出返回附件流而不是 JSON，因此这里直接构造文本响应。
export const runtime = "nodejs"

const scopeSchema = z.enum(["synopsis", "outline", "chapters", "release", "project"])
const formatSchema = z.enum(["docx", "markdown"])

type ProjectExportRouteContext = {
  params: Promise<{
    projectId: string
  }>
}

export async function GET(request: NextRequest, context: ProjectExportRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { projectId } = await context.params
    const scope = scopeSchema.catch("project").parse(request.nextUrl.searchParams.get("scope") ?? "project")
    const format = formatSchema.catch("markdown").parse(request.nextUrl.searchParams.get("format") ?? "markdown")
    const result = await exportProjectContent(actor, projectId, scope, format)

    return new Response(result.content, {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
      },
    })
  } catch (error) {
    return fail(error, request)
  }
}
