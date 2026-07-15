'use client'

import { useChatStore } from '@/features/ai-chat/lib/chat-store'
import { useChatModeStore } from '@/stores/chat-mode-store'
import { MultiModelChat } from '@/features/ai-chat/MultiModelChat'
import { ChatSidebar } from '@/features/ai-chat/ChatSidebar'
import { useEffect } from 'react'

/**
 * Standalone Compare page — no project required
 * Route: /compare
 */
export default function StandaloneComparePage() {
  const { loadSessions, sessions, createSession, selectSession, currentSessionId } = useChatStore()
  const { setMode } = useChatModeStore()

  useEffect(() => {
    loadSessions('')
  }, [loadSessions])

  useEffect(() => {
    const hasCompareSession = sessions.some(s => s.type === 'compare' && !s.projectId)
    if (!hasCompareSession) {
      createSession('', 'compare').then(id => {
        selectSession(id)
        setMode('compare')
      })
    } else {
      const existing = sessions.find(s => s.type === 'compare' && !s.projectId)
      if (existing && currentSessionId !== existing.id) {
        selectSession(existing.id)
      }
      setMode('compare')
    }
  }, [sessions, createSession, selectSession, setMode, currentSessionId])

  return (
    <div className="flex h-full w-full overflow-hidden bg-[var(--bg-base)]">
      <ChatSidebar projectId="" />
      <MultiModelChat projectId="" />
    </div>
  )
}
