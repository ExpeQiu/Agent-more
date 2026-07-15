/**
 * Agent Console 页面入口
 * 路由：/projects/[id]/agent-console
 */

import { AgentConsole } from '@/features/agent-console/AgentConsole'

interface AgentConsolePageProps {
  params: Promise<{
    id: string
  }>
}

export default async function AgentConsolePage({ params }: AgentConsolePageProps) {
  const { id } = await params

  return (
    <div className="h-full w-full overflow-hidden">
      <AgentConsole projectId={id} />
    </div>
  )
}
