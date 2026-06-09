import { notFound } from "next/navigation"
import { SiVersions } from "@/components/si/si-versions"
import { getSiById } from "@/mocks/si-data"

export default async function SiVersionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const si = getSiById(id)
  if (!si) notFound()
  return <SiVersions si={si} />
}
