import { notFound } from "next/navigation"

import { SiForm } from "@/components/si/si-form"
import { getStoryIdea } from "@/server/modules/si/si.service"
import { ApiError } from "@/server/shared/api-response"
import { requireServerCurrentUser } from "@/server/shared/current-user"

export default async function EditSiPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const actor = await requireServerCurrentUser()

  try {
    // 编辑页与详情页共用同一份真实 SI 数据，避免 mock 与数据库状态再分叉。
    const { si } = await getStoryIdea(actor, id)
    return <SiForm mode="edit" initial={si} />
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound()
    }

    throw error
  }
}
