import { type NextRequest } from "next/server"
import { z } from "zod"

import { assertOpenContentApiToken, openContentAuditContext } from "@/server/auth/open-api-token"
import { listOpenProjectContent } from "@/server/modules/open/open-content.service"
import { fail, ok } from "@/server/shared/api-response"

export const runtime = "nodejs"

const idSchema = z.string().regex(/^[1-9]\d*$/, "projectId 必须是大于 0 的数字字符串").transform((value) => BigInt(value))

const orderRangeSchema = z
  .string()
  .regex(/^[1-9]\d*(?:-[1-9]\d*)?$/, "order 必须是正整数或起止范围，例如 1-3")
  .transform((value) => {
    const [startValue, endValue] = value.split("-")
    const start = Number(startValue)
    return {
      start,
      end: Number(endValue ?? startValue),
    }
  })
  // 当前数据库章序是无符号 32 位整数；在 Route 层拦截超界值，避免精度丢失或下沉成数据库错误。
  .refine(
    (value) => Number.isSafeInteger(value.start) && Number.isSafeInteger(value.end) && value.end <= 4_294_967_295,
    "order 超出支持范围",
  )
  .refine((value) => value.start <= value.end, "order 的结束章序不能小于起始章序")

const querySchema = z
  .object({
    stage: z.enum(["synopsis", "outline", "chapter"], {
      message: "stage 只能是 synopsis、outline 或 chapter",
    }),
    order: orderRangeSchema.optional(),
    page: z.coerce.number().int("page 必须是整数").positive("page 必须大于 0").default(1),
    pageSize: z.coerce
      .number()
      .int("pageSize 必须是整数")
      .positive("pageSize 必须大于 0")
      .max(100, "pageSize 不能超过 100")
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.order && value.stage !== "chapter") {
      context.addIssue({
        code: "custom",
        path: ["order"],
        message: "order 只适用于 chapter 阶段",
      })
    }

    // 不传 pageSize 表示显式读取该阶段全部内容，此时 page 只能是第一页。
    if (!value.pageSize && value.page !== 1) {
      context.addIssue({
        code: "custom",
        path: ["page"],
        message: "指定 page 时必须同时提供 pageSize",
      })
    }
  })

type ProjectContentRouteContext = {
  params: Promise<{
    projectId: string
  }>
}

export async function GET(request: NextRequest, context: ProjectContentRouteContext) {
  try {
    const principal = assertOpenContentApiToken(request)
    const { projectId: rawProjectId } = await context.params
    const projectId = idSchema.parse(rawProjectId)
    const searchParams = request.nextUrl.searchParams
    const query = querySchema.parse({
      stage: searchParams.get("stage") ?? undefined,
      order: searchParams.get("order") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
    })
    const result = await listOpenProjectContent({
      projectId,
      stage: query.stage,
      orderRange: query.order ?? null,
      page: query.page,
      pageSize: query.pageSize ?? null,
      principal,
      audit: openContentAuditContext(request, principal),
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
