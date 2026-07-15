'use client'

import { useChatStore } from '@/features/ai-chat/lib/chat-store'
import { MultiModelChat } from '@/features/ai-chat/MultiModelChat'
import { ChatSidebar } from '@/features/ai-chat/ChatSidebar'
import { useEffect } from 'react'

/**
 * Standalone AI Chat page — no project required
 * Route: /chat
 */
export default function StandaloneChatPage() {
  const { loadSessions } = useChatStore()

  useEffect(() => {
    loadSessions('')
  }, [loadSessions])

  return (
    <div className="flex h-full w-full overflow-hidden bg-[var(--bg-base)]">
      <ChatSidebar projectId="" />
      <MultiModelChat projectId="" />
    </div>
  )
}
