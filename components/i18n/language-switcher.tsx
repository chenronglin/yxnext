"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Languages } from "lucide-react"

import { useI18n } from "@/components/i18n-provider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/app-feedback"
import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/config"
import { useT } from "@/hooks/use-t"

const LOCALE_LABELS: Record<Locale, string> = {
  "zh-CN": "中文",
  "en-US": "English",
}

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const t = useT()
  const { locale, setLocale } = useI18n()
  const [saving, setSaving] = useState(false)

  async function handleLocaleChange(nextLocale: string) {
    if (nextLocale === locale || saving) {
      return
    }

    const localeValue = nextLocale as Locale
    setSaving(true)

    try {
      // 语言切换通过统一接口完成：未登录只写 Cookie，已登录额外写用户偏好。
      await fetch("/api/i18n/locale", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          locale: localeValue,
        }),
      })

      setLocale(localeValue)
      router.refresh()
      toast({ type: "success", title: t("settings.languageSaved") })
    } catch {
      toast({ type: "error", title: t("settings.languageSaveFailed") })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {!compact && (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Languages className="size-4" />
          {t("common.language")}
        </span>
      )}
      <Select value={locale} onValueChange={(value) => void handleLocaleChange(value)} disabled={saving}>
        <SelectTrigger size="sm" className="min-w-28">
          <SelectValue>{LOCALE_LABELS[locale]}</SelectValue>
        </SelectTrigger>
        <SelectContent align="end">
          {SUPPORTED_LOCALES.map((item) => (
            <SelectItem key={item} value={item}>
              {LOCALE_LABELS[item]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
