import "server-only"

import type { Prisma } from "@prisma/client"

import { buildWorkdayExceptionMap } from "@/lib/workday-calendar"
import { prisma } from "@/server/db/prisma"

type WorkdayExceptionClient = Pick<Prisma.TransactionClient, "workdayException"> | typeof prisma

/**
 * 例外日期数量按年通常只有几十条，统一一次读取可避免阶段批量计算时产生 N+1 查询。
 */
export async function loadWorkdayExceptionMap(client: WorkdayExceptionClient = prisma) {
  const delegate = (client as WorkdayExceptionClient & {
    workdayException?: WorkdayExceptionClient["workdayException"]
  }).workdayException

  // 部分单元测试只提供当前用例涉及的 Prisma delegate；缺少日历 delegate 时按普通周末规则运行。
  if (!delegate) {
    return new Map<string, boolean>()
  }

  const items = await delegate.findMany({
    select: {
      date: true,
      isWorkday: true,
    },
    orderBy: {
      date: "asc",
    },
  })

  return buildWorkdayExceptionMap(items)
}
