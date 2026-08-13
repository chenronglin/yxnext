import { type NextRequest } from "next/server"
import { z } from "zod"

import { assertOpenApiToken } from "@/server/auth/open-api-token"
import { listOpenProjects } from "@/server/modules/open/open-project.service"
import { fail, ok } from "@/server/shared/api-response"

// Open API 需要访问 Prisma 和 Node.js crypto，固定运行在 Node.js runtime。
export const runtime = "nodejs"

const querySchema = z.object({
  // 页码和每页数量采用严格校验；与后台页面的宽松回退不同，外部契约会明确报告错误参数。
  page: z.coerce.number().int("page 必须是整数").positive("page 必须大于 0").default(1),
  pageSize: z.coerce
    .number()
    .int("pageSize 必须是整数")
    .positive("pageSize 必须大于 0")
    .max(100, "pageSize 不能超过 100")
    .default(20),
  // 要求时间戳包含 Z 或明确的时区偏移，避免调用方和服务器时区不同导致增量边界漂移。
  updatedSince: z.iso.datetime({ offset: true }).transform((value) => new Date(value)).optional(),
  includeChapters: z
    .enum(["true", "false"], { message: "includeChapters 只能是 true 或 false" })
    .default("false")
    .transform((value) => value === "true"),
})

export async function GET(request: NextRequest) {
  try {
    // 先完成 Token 校验，再解析参数，避免未认证调用方利用校验差异探测接口行为。
    assertOpenApiToken(request)

    const searchParams = request.nextUrl.searchParams
    const query = querySchema.parse({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      updatedSince: searchParams.get("updatedSince") ?? undefined,
      includeChapters: searchParams.get("includeChapters") ?? undefined,
    })
    const result = await listOpenProjects({
      ...query,
      updatedSince: query.updatedSince ?? null,
    })
    const response = ok(result)

    // 项目数据只供获得 Token 的服务端 Agent 使用，不允许共享缓存保存带权限的数据。
    response.headers.set("Cache-Control", "private, no-store")
    return response
  } catch (error) {
    const response = fail(error, request)
    response.headers.set("Cache-Control", "private, no-store")

    // 标准 WWW-Authenticate 响应头便于 Agent 客户端正确识别 Bearer 认证失败。
    if (response.status === 401) {
      response.headers.set("WWW-Authenticate", "Bearer")
    }

    return response
  }
}
