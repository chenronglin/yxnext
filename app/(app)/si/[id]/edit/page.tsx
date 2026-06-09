import { notFound } from "next/navigation"
import { SiForm } from "@/components/si/si-form"
import { getSiById } from "@/lib/si-data"

export default async function EditSiPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const si = getSiById(id)
  if (!si) notFound()
  return <SiForm mode="edit" initial={si} />
}
