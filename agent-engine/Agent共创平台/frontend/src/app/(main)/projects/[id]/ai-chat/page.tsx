import { ChatSidebar } from '@/features/ai-chat/ChatSidebar'
import { MultiModelChat } from '@/features/ai-chat/MultiModelChat'

interface AIChatPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function AIChatPage({ params }: AIChatPageProps) {
  const { id: projectId } = await params

  return (
    <div className="flex h-full w-full overflow-hidden bg-gray-50">
      <ChatSidebar projectId={projectId} />
      <MultiModelChat projectId={projectId} />
    </div>
  )
}
