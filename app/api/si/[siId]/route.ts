import { type NextRequest } from "next/server"
import { z } from "zod"

import { deleteStoryIdea, getStoryIdea, updateStoryIdea } from "@/server/modules/si/si.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// SI 详情和编辑都访问数据库，固定使用 Node.js runtime。
export const runtime = "nodejs"

const siPatchSchema = z.object({}).passthrough()

type SiRouteContext = {
  params: Promise<{
    siId: string
  }>
}

export async function GET(request: NextRequest, context: SiRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { siId } = await context.params
    const result = await getStoryIdea(actor, siId)

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}

export async function PATCH(request: NextRequest, context: SiRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { siId } = await context.params
    const body = siPatchSchema.parse(await request.json().catch(() => ({})))
    const result = await updateStoryIdea(actor, siId, body)

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}

export async function DELETE(request: NextRequest, context: SiRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { siId } = await context.params
    const result = await deleteStoryIdea(actor, siId)

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}
