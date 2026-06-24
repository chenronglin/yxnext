"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config"
import type { TFunction } from "@/lib/i18n/dictionary"
import { interpolate, type I18nParams } from "@/lib/i18n/interpolate"

type I18nContextValue = {
  locale: Locale
  messages: Record<string, string>
  t: TFunction
  setLocale: (locale: Locale) => void
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({
  children,
  locale,
  messages,
}: {
  children: ReactNode
  locale: Locale
  messages: Record<string, string>
}) {
  const [currentLocale, setCurrentLocale] = useState(locale)
  const [currentMessages, setCurrentMessages] = useState<Record<string, string>>(messages)

  const setLocale = useCallback((nextLocale: Locale) => {
    // 真正的偏好保存由语言切换组件调用 API 完成。
    // 这里仅更新本地上下文，便于后续需要无刷新预览时复用。
    setCurrentLocale(nextLocale)
  }, [])

  const t = useCallback<TFunction>(
    (key, params?: I18nParams, fallback?: string) => {
      const template = currentMessages[key] ?? fallback ?? key
      return interpolate(template, params)
    },
    [currentMessages],
  )

  const value = useMemo(
    () => ({
      locale: currentLocale,
      messages: currentMessages,
      t,
      setLocale,
    }),
    [currentLocale, currentMessages, setLocale, t],
  )

  useEffect(() => {
    // 当服务端刷新后传入了新的 locale/messages，要同步到客户端状态。
    setCurrentLocale(locale)
    setCurrentMessages(messages)
  }, [locale, messages])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const context = useContext(I18nContext)

  if (!context) {
    // 这个 fallback 只用于开发期定位 Provider 缺失，生产页面应始终由 RootLayout 包裹。
    return {
      locale: DEFAULT_LOCALE,
      messages: {},
      t: ((key: string, _params?: I18nParams, fallback?: string) => fallback ?? key) as TFunction,
      setLocale: () => undefined,
    }
  }

  return context
}
