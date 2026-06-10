import { DocCleanView } from "@/components/doc/doc-clean-view"

export default async function DocCleanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; docType: string }>
  searchParams: Promise<{ rev?: string }>
}) {
  const { id, docType } = await params
  const { rev } = await searchParams
  return <DocCleanView projectId={id} docRef={docType} revisionId={rev} />
}
