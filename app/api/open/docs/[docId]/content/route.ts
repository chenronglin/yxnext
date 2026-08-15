import { type NextRequest } from "next/server"
import { z } from "zod"

import { assertOpenContentApiToken, openContentAuditContext } from "@/server/auth/open-api-token"
import { getOpenDocContent } from "@/server/modules/open/open-content.service"
import { fail, ok } from "@/server/shared/api-response"

export const runtime = "nodejs"

const idSchema = z.string().regex(/^[1-9]\d*$/, "docId 必须是大于 0 的数字字符串").transform((value) => BigInt(value))

type ContentRouteContext = {
  params: Promise<{
    docId: string
  }>
}

export async function GET(request: NextRequest, context: ContentRouteContext) {
  try {
    // 正文接口只接受独立内容 Token；元数据 Token 在这里会被视为无效凭证。
    const principal = assertOpenContentApiToken(request)
    const { docId: rawDocId } = await context.params
    const docId = idSchema.parse(rawDocId)
    const result = await getOpenDocContent({
      docId,
      principal,
      audit: openContentAuditContext(request, principal),
    })
    const response = ok(result)

    // 核心正文禁止浏览器、CDN 或共享代理缓存，减少 Token 泄漏后留下额外副本的风险。
    response.headers.set("Cache-Control", "private, no-store")
    return response
  } catch (error) {
    const response = fail(error, request)
    response.headers.set("Cache-Control", "private, no-store")

    if (response.status === 401) {
      response.headers.set("WWW-Authenticate", "Bearer")
    }

    return response
  }
}
