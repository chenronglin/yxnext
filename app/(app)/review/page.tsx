import { redirect } from "next/navigation"

import { prisma } from "@/server/db/prisma"
import { requireServerCurrentUser } from "@/server/shared/current-user"

type ReviewRedirectPageProps = {
  searchParams: Promise<{
    docId?: string
  }>
}

function isNumericId(value: string | undefined): value is string {
  return Boolean(value && /^\d+$/.test(value))
}

export default async function ReviewRedirectPage({ searchParams }: ReviewRedirectPageProps) {
  const actor = await requireServerCurrentUser()
  const { docId } = await searchParams
  const targetDocId = docId

  if (!isNumericId(targetDocId)) {
    redirect("/projects")
  }

  const numericDocId = BigInt(targetDocId)
  const projectVisibility =
    actor.role === "admin"
      ? {}
      : actor.role === "editor"
        ? {
            project: {
              editorId: actor.userId,
            },
          }
        : {
            project: {
              authorId: actor.userId,
            },
          }

  const doc = await prisma.doc.findFirst({
    where: {
      docId: numericDocId,
      isDeleted: false,
      ...projectVisibility,
    },
    select: {
      docId: true,
      projectId: true,
    },
  })

  if (!doc) {
    redirect("/projects")
  }

  // 审稿动作已经收敛到文稿编辑页；旧工作台链接只负责把用户送到真正工作的页面。
  redirect(`/projects/${doc.projectId.toString()}/docs/${doc.docId.toString()}`)
}
