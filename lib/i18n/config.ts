// i18n 配置只放与运行环境无关的常量和纯函数，方便客户端、服务端和 middleware 复用。
export const SUPPORTED_LOCALES = ["zh-CN", "en-US"] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: Locale = "zh-CN"

export const LOCALE_COOKIE_NAME = "yx_locale"

const SUPPORTED_LOCALE_SET = new Set<string>(SUPPORTED_LOCALES)

// 语言归一化是整个多语言体系的入口：
// 1. 精确支持 zh-CN / en-US；
// 2. 英文浏览器语言如 en、en-GB 统一落到 en-US；
// 3. 中文及未知值统一回到默认中文，避免非法 Cookie 进入页面状态。
export function normalizeLocale(value: string | null | undefined): Locale {
  const rawValue = value?.trim()

  if (!rawValue) {
    return DEFAULT_LOCALE
  }

  if (SUPPORTED_LOCALE_SET.has(rawValue)) {
    return rawValue as Locale
  }

  const lowerValue = rawValue.toLowerCase()

  if (lowerValue.startsWith("en")) {
    return "en-US"
  }

  return DEFAULT_LOCALE
}

// 表单和接口会先用这个类型守卫过滤输入，再写入数据库或 Cookie。
export function isSupportedLocale(value: string | null | undefined): value is Locale {
  return Boolean(value && SUPPORTED_LOCALE_SET.has(value))
}

// Cookie 的 maxAge 单独导出，保证登录、设置页和公共语言接口使用同一套过期口径。
export const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365
