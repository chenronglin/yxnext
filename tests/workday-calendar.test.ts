import { describe, expect, it } from "vitest"

import {
  addWorkdays,
  countWorkdays,
  formatDateOnlyKey,
  isWorkday,
  previousWorkday,
} from "@/lib/workday-calendar"

const exceptions = [
  { date: "2026-10-01", isWorkday: false },
  { date: "2026-10-04", isWorkday: true },
]

describe("workday-calendar", () => {
  it("默认把周一到周五识别为工作日，周末识别为非工作日", () => {
    expect(isWorkday("2026-09-04")).toBe(true)
    expect(isWorkday("2026-09-05")).toBe(false)
  })

  it("法定节假日和调休工作日覆盖默认周末规则", () => {
    expect(isWorkday("2026-10-01", exceptions)).toBe(false)
    expect(isWorkday("2026-10-04", exceptions)).toBe(true)
  })

  it("按闭区间完成工作日数量与结束日期双向计算", () => {
    expect(countWorkdays("2026-09-07", "2026-09-11")).toBe(5)
    expect(formatDateOnlyKey(addWorkdays("2026-09-07", 5))).toBe("2026-09-11")
  })

  it("支持跨年并跳过节假日", () => {
    const crossYearExceptions = [{ date: "2027-01-01", isWorkday: false }]

    expect(formatDateOnlyKey(addWorkdays("2026-12-31", 2, crossYearExceptions))).toBe("2027-01-04")
    expect(countWorkdays("2026-12-31", "2027-01-04", crossYearExceptions)).toBe(2)
  })

  it("previousWorkday 会跳过周末和连续例外日期", () => {
    expect(formatDateOnlyKey(previousWorkday("2026-10-05", exceptions))).toBe("2026-10-04")
  })

  it("拒绝无效日期和反向区间", () => {
    expect(() => countWorkdays("2026-02-30", "2026-03-01")).toThrow("日期无效")
    expect(() => countWorkdays("2026-09-02", "2026-09-01")).toThrow("结束日期不能早于开始日期")
  })
})
