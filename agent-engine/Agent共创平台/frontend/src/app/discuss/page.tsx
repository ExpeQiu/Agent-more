'use client'

import { useChatStore } from '@/features/ai-chat/lib/chat-store'
import { useChatModeStore } from '@/stores/chat-mode-store'
import { MultiModelChat } from '@/features/ai-chat/MultiModelChat'
import { ChatSidebar } from '@/features/ai-chat/ChatSidebar'
import { useEffect } from 'react'

/**
 * Standalone Discuss page — no project required
 * Route: /discuss
 */
export default function StandaloneDiscussPage() {
  const { loadSessions, sessions, createSession, selectSession, currentSessionId } = useChatStore()
  const { setMode } = useChatModeStore()

  useEffect(() => {
    loadSessions('')
  }, [loadSessions])

  useEffect(() => {
    const hasDiscussSession = sessions.some(s => s.type === 'agent-discuss' && !s.projectId)
    if (!hasDiscussSession) {
      createSession('', 'agent-discuss').then(id => {
        selectSession(id)
        setMode('agent-discuss')
      })
    } else {
      const existing = sessions.find(s => s.type === 'agent-discuss' && !s.projectId)
      if (existing && currentSessionId !== existing.id) {
        selectSession(existing.id)
      }
      setMode('agent-discuss')
    }
  }, [sessions, createSession, selectSession, setMode, currentSessionId])

  return (
    <div className="flex h-full w-full overflow-hidden bg-[var(--bg-base)]">
      <ChatSidebar projectId="" />
      <MultiModelChat projectId="" />
    </div>
  )
}
