import { notFound } from "next/navigation"
import { SiDetail } from "@/components/si/si-detail"
import { getSiById } from "@/mocks/si-data"

export default async function SiDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const si = getSiById(id)
  if (!si) notFound()
  return <SiDetail si={si} />
}
