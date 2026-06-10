import { DocCleanView } from "@/components/doc/doc-clean-view"

export default async function DocCleanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; docType: string }>
  searchParams: Promise<{ rev?: string }>
}) {
  const { id, docType: docId } = await params
  const { rev } = await searchParams
  return <DocCleanView projectId={id} docRef={docId} revisionId={rev} />
}
