import { type NextRequest } from "next/server"

import { rollbackStoryIdeaVersion } from "@/server/modules/si/si.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

// 版本回退需要回写 SI 主记录、重建版本快照并保留 rollback_from_version_id，因此必须走事务。
export const runtime = "nodejs"

type RollbackRouteContext = {
  params: Promise<{
    siId: string
    versionId: string
  }>
}

export async function POST(request: NextRequest, context: RollbackRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { siId, versionId } = await context.params
    const result = await rollbackStoryIdeaVersion(actor, siId, versionId)

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}
