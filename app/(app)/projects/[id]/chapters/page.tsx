import { redirect } from "next/navigation"

export default async function ChaptersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // 独立章节管理页已并入项目详情页，保留旧 URL 只做兼容跳转，避免历史链接进入多余页面。
  redirect(`/projects/${id}`)
}
