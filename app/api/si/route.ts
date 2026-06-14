import { type NextRequest } from "next/server"
import { z } from "zod"

import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"
import { createStoryIdea, listStoryIdeas } from "@/server/modules/si/si.service"

// SI 接口依赖 Prisma/MySQL 事务，固定使用 Node.js runtime。
export const runtime = "nodejs"

const siCreateSchema = z.object({}).passthrough()

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiCurrentUser(request)
    const searchParams = request.nextUrl.searchParams

    const result = await listStoryIdeas(actor, {
      keyword: searchParams.get("keyword"),
      status: searchParams.get("status"),
      mainType: searchParams.get("mainType"),
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
    })

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireApiCurrentUser(request)
    const body = siCreateSchema.parse(await request.json().catch(() => ({})))
    const result = await createStoryIdea(actor, body)

    return ok(result, { status: 201 })
  } catch (error) {
    return fail(error)
  }
}
