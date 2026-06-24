import { type NextRequest } from "next/server"

import { downloadGovernanceProjectFinal } from "@/server/modules/admin/admin.service"
import { fail } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 终稿下载会读取最终 Revision 的导出文本，固定使用 Node.js runtime。
export const runtime = "nodejs"

type DownloadFinalRouteContext = {
  params: Promise<{
    projectId: string
  }>
}

export async function GET(request: NextRequest, context: DownloadFinalRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { projectId } = await context.params
    const result = await downloadGovernanceProjectFinal(actor, projectId)

    // 下载接口直接返回文件流，不再包裹统一 JSON 外壳，前端可按附件方式处理。
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
