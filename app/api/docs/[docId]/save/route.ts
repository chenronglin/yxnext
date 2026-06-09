import { type NextRequest } from "next/server"

import { docSaveSchema } from "@/server/modules/doc/doc.schemas"
import { saveDocDraft } from "@/server/modules/doc/doc.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// Doc 草稿保存要用乐观锁和事务，固定运行在 Node.js runtime。
export const runtime = "nodejs"

type SaveDocRouteContext = {
  params: Promise<{
    docId: string
  }>
}

export async function POST(request: NextRequest, context: SaveDocRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { docId } = await context.params
    const body = docSaveSchema.parse(await request.json().catch(() => ({})))
    const result = await saveDocDraft(actor, docId, body)

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}
