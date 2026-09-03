export type WorkdayDateInput = string | Date

export type WorkdayExceptionValue = {
  date: WorkdayDateInput
  isWorkday: boolean
}

export type WorkdayExceptionSource =
  | ReadonlyMap<string, boolean>
  | readonly WorkdayExceptionValue[]

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_IN_MS = 24 * 60 * 60 * 1000

/**
 * 把日期统一转换成 UTC 的“日期值”。
 *
 * 业务这里只关心日历日期，不关心某日的具体时刻；使用 UTC 组件可以避免浏览器、Node 与数据库
 * 因本地时区或夏令时不同而把同一个 YYYY-MM-DD 偏移到前一天/后一天。
 */
export function normalizeDateOnly(value: WorkdayDateInput) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new RangeError("日期无效")
    }

    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
  }

  const match = DATE_ONLY_PATTERN.exec(value)

  if (!match) {
    throw new RangeError("日期必须使用 YYYY-MM-DD 格式")
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const result = new Date(Date.UTC(year, month - 1, day))

  // Date 会自动把 2 月 30 日进位到 3 月；这里反向校验，阻止无效日期悄悄进入计划数据。
  if (
    result.getUTCFullYear() !== year ||
    result.getUTCMonth() !== month - 1 ||
    result.getUTCDate() !== day
  ) {
    throw new RangeError("日期无效")
  }

  return result
}

export function formatDateOnlyKey(value: WorkdayDateInput) {
  return normalizeDateOnly(value).toISOString().slice(0, 10)
}

export function endOfDateOnly(value: WorkdayDateInput) {
  const result = normalizeDateOnly(value)
  result.setUTCHours(23, 59, 59, 999)
  return result
}

export function buildWorkdayExceptionMap(source: WorkdayExceptionSource = []) {
  if (!Array.isArray(source)) {
    return source as ReadonlyMap<string, boolean>
  }

  const items = source as readonly WorkdayExceptionValue[]
  return new Map(items.map((item) => [formatDateOnlyKey(item.date), item.isWorkday]))
}

function addCalendarDays(value: Date, days: number) {
  return new Date(value.getTime() + days * DAY_IN_MS)
}

export function isWorkday(value: WorkdayDateInput, source: WorkdayExceptionSource = []) {
  const date = normalizeDateOnly(value)
  const exception = buildWorkdayExceptionMap(source).get(formatDateOnlyKey(date))

  if (exception !== undefined) {
    return exception
  }

  const weekday = date.getUTCDay()
  return weekday !== 0 && weekday !== 6
}

/**
 * 按闭区间统计工作日。例如周一到周一为 1 个工作日，周一到周五为 5 个工作日。
 */
export function countWorkdays(
  start: WorkdayDateInput,
  end: WorkdayDateInput,
  source: WorkdayExceptionSource = [],
) {
  let cursor = normalizeDateOnly(start)
  const endDate = normalizeDateOnly(end)

  if (cursor.getTime() > endDate.getTime()) {
    throw new RangeError("结束日期不能早于开始日期")
  }

  const exceptionMap = buildWorkdayExceptionMap(source)
  let result = 0

  while (cursor.getTime() <= endDate.getTime()) {
    if (isWorkday(cursor, exceptionMap)) {
      result += 1
    }
    cursor = addCalendarDays(cursor, 1)
  }

  return result
}

/**
 * 从开始日期向后取第 count 个工作日；count=1 表示开始日期若为工作日就返回当天。
 */
export function addWorkdays(
  start: WorkdayDateInput,
  count: number,
  source: WorkdayExceptionSource = [],
) {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError("工作日数量必须是大于等于 0 的整数")
  }

  let cursor = normalizeDateOnly(start)

  if (count === 0) {
    return cursor
  }

  const exceptionMap = buildWorkdayExceptionMap(source)
  let remaining = count

  while (remaining > 0) {
    if (isWorkday(cursor, exceptionMap)) {
      remaining -= 1
      if (remaining === 0) {
        return cursor
      }
    }

    cursor = addCalendarDays(cursor, 1)
  }

  return cursor
}

export function previousWorkday(
  value: WorkdayDateInput,
  source: WorkdayExceptionSource = [],
) {
  const exceptionMap = buildWorkdayExceptionMap(source)
  let cursor = addCalendarDays(normalizeDateOnly(value), -1)

  while (!isWorkday(cursor, exceptionMap)) {
    cursor = addCalendarDays(cursor, -1)
  }

  return cursor
}
