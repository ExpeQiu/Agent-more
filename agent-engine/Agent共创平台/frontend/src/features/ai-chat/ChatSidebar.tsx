'use client'

/**
 * ChatSidebar - 侧边栏入口
 * 复用 AppSidebar 组件，简化自身逻辑
 */

import { AppSidebar } from '@/components/shared/AppSidebar'
import { useChatStore } from './lib/chat-store'

interface ChatSidebarProps {
  projectId: string
}

export function ChatSidebar({ projectId }: ChatSidebarProps) {
  const { currentSessionId, selectSession } = useChatStore()

  return (
    <AppSidebar
      projectId={projectId}
      currentSessionId={currentSessionId}
      onSelectSession={selectSession}
    />
  )
}
