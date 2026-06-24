import { type NextRequest } from "next/server"

import { cleanupExpiredUserSessions } from "@/server/auth/session"
import { fail, ok, ApiError } from "@/server/shared/api-response"
import { syncActiveProjectTimelineStatuses } from "@/server/shared/project-stage-timeline"

export const runtime = "nodejs"

function assertCronSecret(request: NextRequest) {
  const expected = process.env.CRON_SECRET
  const authorization = request.headers.get("authorization")

  if (!expected) {
    throw new ApiError({
      status: 500,
      code: "CRON_SECRET_MISSING",
      message: "定时任务密钥未配置",
    })
  }

  if (authorization !== `Bearer ${expected}`) {
    throw new ApiError({
      status: 401,
      code: "CRON_UNAUTHORIZED",
      message: "定时任务密钥不正确",
    })
  }
}

export async function POST(request: NextRequest) {
  try {
    assertCronSecret(request)

    // 阶段计划逾期同步和会话清理都属于后台维护任务，集中在同一个 Cron 入口触发。
    const [timeline, sessions] = await Promise.all([
      syncActiveProjectTimelineStatuses(),
      cleanupExpiredUserSessions(),
    ])

    return ok({
      timeline,
      sessions,
    })
  } catch (error) {
    return fail(error, request)
  }
}
