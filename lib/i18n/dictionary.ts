import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config"
import { interpolate, type I18nParams } from "@/lib/i18n/interpolate"
import { enUSMessages } from "@/lib/i18n/locales/en-US"
import { zhCNMessages, type ZhCNMessages } from "@/lib/i18n/locales/zh-CN"

export type Messages = ZhCNMessages
export type I18nKey = keyof typeof zhCNMessages

export type TFunction = (key: I18nKey | (string & {}), params?: I18nParams, fallback?: string) => string

const MESSAGE_TABLE: Record<Locale, Record<string, string>> = {
  "zh-CN": zhCNMessages,
  "en-US": enUSMessages,
}

// 字典读取永远返回一个可查表对象，不让未知 locale 影响运行时。
export function getMessages(locale: Locale) {
  return MESSAGE_TABLE[locale] ?? MESSAGE_TABLE[DEFAULT_LOCALE]
}

// 翻译函数允许传入动态 key，比如 api.${code}。
// 如果当前语言没有对应 key，会先回退到中文，再回退到调用方给的 fallback。
export function translate(
  locale: Locale,
  key: I18nKey | (string & {}),
  params?: I18nParams,
  fallback?: string,
) {
  const messages = getMessages(locale)
  const defaultMessages = getMessages(DEFAULT_LOCALE)
  const template = messages[key] ?? defaultMessages[key] ?? fallback ?? key

  return interpolate(template, params)
}

export function createT(locale: Locale): TFunction {
  return (key, params, fallback) => translate(locale, key, params, fallback)
}

// 这个工具给测试和扫描脚本使用，用于明确判断 key 是否真实存在。
export function hasI18nKey(key: string): key is I18nKey {
  return key in zhCNMessages
}
