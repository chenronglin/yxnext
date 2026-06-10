import { DocVersionList } from "@/components/doc/doc-version-list"

export default async function DocVersionsPage({
  params,
}: {
  params: Promise<{ id: string; docType: string }>
}) {
  const { id, docType: docId } = await params
  return <DocVersionList projectId={id} docRef={docId} />
}
