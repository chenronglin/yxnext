import "server-only"

import { cookies, headers } from "next/headers"
import type { NextRequest } from "next/server"

import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  normalizeLocale,
  type Locale,
} from "@/lib/i18n/config"
import { createT, getMessages, translate } from "@/lib/i18n/dictionary"
import type { I18nParams } from "@/lib/i18n/interpolate"
import { getCurrentUser } from "@/server/auth/session"
import type { CurrentUser } from "@/types/domain"

function localeFromAcceptLanguage(value: string | null) {
  // Accept-Language 可能是 "en-US,en;q=0.9,zh-CN;q=0.8"。
  // 当前只区分中文和英文，因此按浏览器优先项逐个归一化即可。
  const candidates = value?.split(",").map((item) => item.split(";")[0]?.trim()).filter(Boolean) ?? []

  for (const candidate of candidates) {
    const locale = normalizeLocale(candidate)

    if (locale !== DEFAULT_LOCALE || candidate?.toLowerCase().startsWith("zh")) {
      return locale
    }
  }

  return DEFAULT_LOCALE
}

function localeFromRequest(request: NextRequest) {
  const cookieLocale = request.cookies.get(LOCALE_COOKIE_NAME)?.value

  if (cookieLocale) {
    return normalizeLocale(cookieLocale)
  }

  return localeFromAcceptLanguage(request.headers.get("accept-language"))
}

// 服务端组件优先读取已登录用户偏好；未登录页面才按 Cookie 和浏览器语言兜底。
export async function getRequestLocale(): Promise<Locale> {
  const currentUser = await getCurrentUser().catch(() => null)

  if (currentUser?.preferredLocale) {
    return normalizeLocale(currentUser.preferredLocale)
  }

  const cookieStore = await cookies()
  const cookieLocale = cookieStore.get(LOCALE_COOKIE_NAME)?.value

  if (cookieLocale) {
    return normalizeLocale(cookieLocale)
  }

  const headerStore = await headers()
  return localeFromAcceptLanguage(headerStore.get("accept-language"))
}

// API 路由已经完成鉴权时传入 actor，可以避免再次查询 session。
export function getApiLocale(request: NextRequest, actor?: Pick<CurrentUser, "preferredLocale"> | null): Locale {
  if (actor?.preferredLocale) {
    return normalizeLocale(actor.preferredLocale)
  }

  return localeFromRequest(request)
}

export async function getServerMessages(locale?: Locale) {
  return getMessages(locale ?? (await getRequestLocale()))
}

export async function getServerT(locale?: Locale) {
  return createT(locale ?? (await getRequestLocale()))
}

export function renderServerMessage(locale: Locale, key: string, params?: I18nParams, fallback?: string) {
  return translate(locale, key, params, fallback)
}
