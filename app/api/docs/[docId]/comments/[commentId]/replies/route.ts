import { type NextRequest } from "next/server"
import { z } from "zod"

import { createCommentReply, listCommentReplies } from "@/server/modules/doc/comment-reply.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

export const runtime = "nodejs"

const createReplySchema = z.object({
  content: z.string().trim().min(1).max(2_000),
})

type ReplyRouteContext = {
  params: Promise<{ docId: string; commentId: string }>
}

export async function GET(request: NextRequest, context: ReplyRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { docId, commentId } = await context.params
    return ok(await listCommentReplies(actor, docId, commentId))
  } catch (error) {
    return fail(error, request)
  }
}

export async function POST(request: NextRequest, context: ReplyRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { docId, commentId } = await context.params
    const body = createReplySchema.parse(await request.json().catch(() => ({})))
    return ok(await createCommentReply(actor, docId, commentId, body), { status: 201 })
  } catch (error) {
    return fail(error, request)
  }
}
