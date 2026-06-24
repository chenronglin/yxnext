export type I18nParams = Record<string, string | number | boolean | null | undefined>

// 模板插值只替换 {key} 这种明确占位符，不执行任何表达式。
// 变量来自业务数据时保持原样输出，遵守“用户内容不翻译”的边界。
export function interpolate(template: string, params?: I18nParams) {
  if (!params) {
    return template
  }

  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key]

    if (value === null || value === undefined) {
      return ""
    }

    return String(value)
  })
}
