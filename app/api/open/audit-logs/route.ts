import { type NextRequest } from "next/server"
import { z } from "zod"

import { assertOpenApiToken } from "@/server/auth/open-api-token"
import { listOpenAuditLogs } from "@/server/modules/open/open-audit.service"
import { fail, ok } from "@/server/shared/api-response"

// 审计日志查询依赖 Prisma 和 Node.js Token 鉴权，固定使用 Node.js runtime。
export const runtime = "nodejs"

const idSchema = z
  .string()
  // 正则同时排除非数字和 0，确保只有合法正整数才进入 BigInt 转换，避免非法输入变成 500。
  .regex(/^[1-9]\d*$/, "ID 必须是大于 0 的数字字符串")
  .transform((value) => BigInt(value))

const timestampSchema = z.iso.datetime({ offset: true }).transform((value) => new Date(value))

const querySchema = z
  .object({
    page: z.coerce.number().int("page 必须是整数").positive("page 必须大于 0").default(1),
    pageSize: z.coerce
      .number()
      .int("pageSize 必须是整数")
      .positive("pageSize 必须大于 0")
      .max(100, "pageSize 不能超过 100")
      .default(20),
    projectId: idSchema.optional(),
    docId: idSchema.optional(),
    actorId: idSchema.optional(),
    operator: z.string().trim().min(1, "operator 不能为空").max(100, "operator 不能超过 100 个字符").optional(),
    action: z.string().trim().min(1, "action 不能为空").max(128, "action 不能超过 128 个字符").optional(),
    startAt: timestampSchema.optional(),
    endAt: timestampSchema.optional(),
    updatedSince: timestampSchema.optional(),
  })
  .superRefine((value, context) => {
    // 时间范围允许只传一端；两端同时存在时必须保持自然顺序。
    if (value.startAt && value.endAt && value.startAt > value.endAt) {
      context.addIssue({
        code: "custom",
        path: ["endAt"],
        message: "endAt 不能早于 startAt",
      })
    }
  })

export async function GET(request: NextRequest) {
  try {
    // 与项目列表共用 OPEN_PROJECTS_API_TOKEN，但该 Token 仍只在 /api/open 的 GET 路由中生效。
    assertOpenApiToken(request)

    const searchParams = request.nextUrl.searchParams
    const query = querySchema.parse({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      projectId: searchParams.get("projectId") ?? undefined,
      docId: searchParams.get("docId") ?? undefined,
      actorId: searchParams.get("actorId") ?? undefined,
      operator: searchParams.get("operator") ?? undefined,
      action: searchParams.get("action") ?? undefined,
      startAt: searchParams.get("startAt") ?? undefined,
      endAt: searchParams.get("endAt") ?? undefined,
      updatedSince: searchParams.get("updatedSince") ?? undefined,
    })
    const result = await listOpenAuditLogs({
      page: query.page,
      pageSize: query.pageSize,
      projectId: query.projectId ?? null,
      docId: query.docId ?? null,
      actorId: query.actorId ?? null,
      operator: query.operator ?? null,
      action: query.action ?? null,
      startAt: query.startAt ?? null,
      endAt: query.endAt ?? null,
      updatedSince: query.updatedSince ?? null,
    })
    const response = ok(result)

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
