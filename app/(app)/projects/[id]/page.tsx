import { ProjectDetail } from "@/components/project/project-detail"

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ProjectDetail id={id} />
}
