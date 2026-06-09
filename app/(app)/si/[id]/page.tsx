import { notFound } from "next/navigation"

import { SiDetail } from "@/components/si/si-detail"
import { getStoryIdea } from "@/server/modules/si/si.service"
import { ApiError } from "@/server/shared/api-response"
import { requireServerCurrentUser } from "@/server/shared/current-user"

export default async function SiDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const actor = await requireServerCurrentUser()

  try {
    // 详情页在服务端直接调 service，避免为了读取一条 SI 再走一层内部 HTTP。
    const { si } = await getStoryIdea(actor, id)
    return <SiDetail si={si} />
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound()
    }

    throw error
  }
}
