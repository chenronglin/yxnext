import { DocEditor } from "@/components/doc/doc-editor"

export default async function DocEditorPage({
  params,
}: {
  params: Promise<{ id: string; docType: string }>
}) {
  const { id, docType } = await params
  return <DocEditor projectId={id} docType={docType} />
}
