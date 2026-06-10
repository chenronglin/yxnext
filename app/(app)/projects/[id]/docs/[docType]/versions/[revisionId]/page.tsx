import { DocVersionDetail } from "@/components/doc/doc-version-detail"

export default async function DocVersionDetailPage({
  params,
}: {
  params: Promise<{ id: string; docType: string; revisionId: string }>
}) {
  const { id, docType: docId, revisionId } = await params
  return <DocVersionDetail projectId={id} docRef={docId} revisionId={revisionId} />
}
