import { type NextRequest } from "next/server"

import { listTodos } from "@/server/modules/workbench/workbench.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 待办列表要同时读取真实 todo、阶段预警和审批任务，必须放在服务端聚合。
export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiCurrentUser(request)
    const result = await listTodos(actor)

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}
