import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDateOnly(value: string | Date | null | undefined) {
  if (!value || value === "—") {
    return "—"
  }

  if (value instanceof Date) {
    // Date 对象一般来自本地运行时，按本地日期输出，避免展示多余时分秒。
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, "0")
    const day = String(value.getDate()).padStart(2, "0")

    return `${year}-${month}-${day}`
  }

  // 后端多数时间字段是 ISO 字符串；直接截取日期部分，避免时区换算把日期前后挪一天。
  const directDate = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (directDate) {
    return directDate[0]
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, "0")
  const day = String(parsed.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

export function formatDateTimeToSeconds(value: string | Date | null | undefined) {
  if (!value || value === "—") {
    return "—"
  }

  const parsed = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    // 无法识别的历史值原样返回，避免格式化失败后把审计时间错误显示为空。
    return String(value)
  }

  // 审计时间按浏览器所在时区展示，并固定补齐两位数字，最终精确到秒。
  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, "0")
  const day = String(parsed.getDate()).padStart(2, "0")
  const hour = String(parsed.getHours()).padStart(2, "0")
  const minute = String(parsed.getMinutes()).padStart(2, "0")
  const second = String(parsed.getSeconds()).padStart(2, "0")

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}
