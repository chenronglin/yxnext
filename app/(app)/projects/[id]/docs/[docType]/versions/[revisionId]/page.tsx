import { DocVersionDetail } from "@/components/doc/doc-version-detail"

export default async function DocVersionDetailPage({
  params,
}: {
  params: Promise<{ id: string; docType: string; revisionId: string }>
}) {
  const { id, docType, revisionId } = await params
  return <DocVersionDetail projectId={id} docRef={docType} revisionId={revisionId} />
}
