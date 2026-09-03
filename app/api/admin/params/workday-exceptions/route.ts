import { type NextRequest } from "next/server"
import { z } from "zod"

import { listWorkdayExceptions, replaceWorkdayExceptions } from "@/server/modules/admin/admin.service"
import { fail, ok } from "@/server/shared/api-response"
import { requireApiCurrentUser } from "@/server/shared/current-user"

export const runtime = "nodejs"

const workdayExceptionsSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  items: z.array(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      isWorkday: z.boolean(),
      name: z.string().trim().min(1).max(100),
    }),
  ),
})

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiCurrentUser(request)
    const year = Number(request.nextUrl.searchParams.get("year") ?? new Date().getUTCFullYear())
    return ok(await listWorkdayExceptions(actor, year))
  } catch (error) {
    return fail(error, request)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const actor = await requireApiCurrentUser(request)
    const body = workdayExceptionsSchema.parse(await request.json().catch(() => ({})))
    return ok(await replaceWorkdayExceptions(actor, body))
  } catch (error) {
    return fail(error, request)
  }
}
