import { type NextRequest } from "next/server"
import { z } from "zod"

import { updateProjectStagePlans } from "@/server/modules/project/project.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

export const runtime = "nodejs"

const stagePlansSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  items: z.array(
    z.object({
      stage: z.enum(["synopsis", "outline", "chapter", "release"]),
      plannedStartAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      plannedEndAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      planDays: z.number().int().positive().optional(),
      lockVersion: z.number().int().nonnegative().optional(),
    }),
  ).min(1),
})

type StagePlansRouteContext = {
  params: Promise<{ projectId: string }>
}

export async function PATCH(request: NextRequest, context: StagePlansRouteContext) {
  try {
    const actor = await requireApiCurrentUser(request)
    const { projectId } = await context.params
    const body = stagePlansSchema.parse(await request.json().catch(() => ({})))
    return ok(await updateProjectStagePlans(actor, projectId, body))
  } catch (error) {
    return fail(error, request)
  }
}
