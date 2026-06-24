import { type NextRequest } from "next/server"
import { z } from "zod"

import {
  LOCALE_COOKIE_MAX_AGE_SECONDS,
  LOCALE_COOKIE_NAME,
  isSupportedLocale,
} from "@/lib/i18n/config"
import { getCurrentUserBySessionId, SESSION_COOKIE_NAME } from "@/server/auth/session"
import { updateAccountPreferredLocale } from "@/server/modules/account/account.service"
import { fail, ok, ApiError } from "@/server/shared/api-response"
import { toApiCurrentUser } from "@/server/shared/current-user"

export const runtime = "nodejs"

const localeSchema = z.object({
  locale: z.string().trim(),
})

function writeLocaleCookie(response: ReturnType<typeof ok>, locale: string) {
  // 语言 Cookie 不承载权限信息，因此允许客户端普通请求写入；
  // 服务端布局会在下一次渲染时读取它，未登录页面也能保持用户选择。
  response.cookies.set({
    name: LOCALE_COOKIE_NAME,
    value: locale,
    sameSite: "lax",
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = localeSchema.parse(await request.json().catch(() => ({})))

    if (!isSupportedLocale(body.locale)) {
      throw new ApiError({
        status: 400,
        code: "LOCALE_INVALID",
        message: "不支持的语言",
      })
    }

    const currentUser = await getCurrentUserBySessionId(request.cookies.get(SESSION_COOKIE_NAME)?.value)

    if (currentUser) {
      await updateAccountPreferredLocale(toApiCurrentUser(currentUser), body.locale)
    }

    const response = ok({
      locale: body.locale,
      persisted: Boolean(currentUser),
    })
    writeLocaleCookie(response, body.locale)

    return response
  } catch (error) {
    return fail(error, request)
  }
}
