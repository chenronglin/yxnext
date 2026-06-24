import "server-only"

import { translate, hasI18nKey } from "@/lib/i18n/dictionary"
import type { Locale } from "@/lib/i18n/config"
import type { I18nParams } from "@/lib/i18n/interpolate"
import { PROJECT_STAGE_LABEL_KEYS, type ProjectStage } from "@/types/domain"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function toRenderableParams(locale: Locale, params: unknown): I18nParams {
  if (!isRecord(params)) {
    return {}
  }

  const result: I18nParams = {}

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
      result[key] = value
    }
  }

  const stageCode = typeof params.stageCode === "string" ? params.stageCode : null

  // 通知和待办里经常只保存阶段 code；展示时按当前语言派生 stageLabel，
  // 项目标题、Doc 标题等用户输入内容仍然保持原样。
  if (stageCode && stageCode in PROJECT_STAGE_LABEL_KEYS) {
    result.stageLabel = translate(locale, PROJECT_STAGE_LABEL_KEYS[stageCode as ProjectStage])
  }

  return result
}

function resolveMessageKey(baseKey: string, suffix: "title" | "body") {
  const suffixedKey = `${baseKey}.${suffix}`

  if (hasI18nKey(suffixedKey)) {
    return suffixedKey
  }

  return baseKey
}

export function renderSystemMessage(
  locale: Locale,
  key: string | null | undefined,
  params: unknown,
  fallback: string,
) {
  if (!key) {
    return fallback
  }

  return translate(locale, key, toRenderableParams(locale, params), fallback)
}

export function renderSystemTitle(
  locale: Locale,
  baseKey: string | null | undefined,
  params: unknown,
  fallback: string,
) {
  if (!baseKey) {
    return fallback
  }

  return renderSystemMessage(locale, resolveMessageKey(baseKey, "title"), params, fallback)
}

export function renderSystemBody(
  locale: Locale,
  baseKey: string | null | undefined,
  params: unknown,
  fallback: string,
) {
  if (!baseKey) {
    return fallback
  }

  return renderSystemMessage(locale, resolveMessageKey(baseKey, "body"), params, fallback)
}

export function getStringParam(params: unknown, key: string) {
  if (!isRecord(params)) {
    return null
  }

  const value = params[key]
  return typeof value === "string" ? value : null
}
