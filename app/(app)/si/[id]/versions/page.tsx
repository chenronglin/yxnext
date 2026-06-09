import { notFound } from "next/navigation"

import { SiVersions } from "@/components/si/si-versions"
import { getStoryIdea } from "@/server/modules/si/si.service"
import { ApiError } from "@/server/shared/api-response"
import { requireServerCurrentUser } from "@/server/shared/current-user"

export default async function SiVersionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const actor = await requireServerCurrentUser()

  try {
    // 版本页直接复用详情接口返回的 versions 数组，不再依赖本地假数据。
    const { si } = await getStoryIdea(actor, id)
    return <SiVersions si={si} versions={si.versions} />
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound()
    }

    throw error
  }
}
