import { describe, expect, it } from "vitest"

import { normalizeLocale } from "@/lib/i18n/config"
import { translate } from "@/lib/i18n/dictionary"
import { interpolate } from "@/lib/i18n/interpolate"
import { enUSMessages } from "@/lib/i18n/locales/en-US"
import { zhCNMessages } from "@/lib/i18n/locales/zh-CN"

describe("i18n", () => {
  it("会把英文浏览器语言归一化为 en-US，其它未知值回退中文", () => {
    expect(normalizeLocale("en")).toBe("en-US")
    expect(normalizeLocale("en-GB")).toBe("en-US")
    expect(normalizeLocale("zh-CN")).toBe("zh-CN")
    expect(normalizeLocale("fr-FR")).toBe("zh-CN")
  })

  it("只替换显式占位符，缺失参数按空字符串处理", () => {
    expect(interpolate("Hello {name}, {missing}", { name: "Moses" })).toBe("Hello Moses, ")
  })

  it("英文和中文 key 集合保持一致", () => {
    expect(Object.keys(enUSMessages).sort()).toEqual(Object.keys(zhCNMessages).sort())
  })

  it("缺失动态 key 时使用调用方 fallback", () => {
    expect(translate("en-US", "api.NOT_DEFINED", undefined, "Fallback message")).toBe("Fallback message")
  })
})
