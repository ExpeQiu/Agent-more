'use client'

/**
 * MultiModelChat - 统一聊天主视图
 * 根据 session.type 渲染 Single / Compare / Agent Discussion 模式
 * 集成 ModeSwitcher、AppSidebar、ChatInput
 */

import { useEffect, useRef } from 'react'
import { Bot } from 'lucide-react'
import { useChatStore } from './lib/chat-store'
import { useChatModeStore } from '@/stores/chat-mode-store'
import { ModeSwitcher } from '@/components/shared/ModeSwitcher'
import { ModelSelector } from '@/components/shared/ModelSelector'
import { MessageBubble, getModelName } from './MessageBubble'
import { CompareView } from './CompareView'
import { AgentDiscussion } from './AgentDiscussion'
import { ChatInput } from './ChatInput'
import { EmptyState } from '@/components/shared/EmptyState'
import { AGENT_ROLES } from './lib/models'
import { cn } from '@/lib/utils'
import type { AgentRole } from './lib/models'

interface MultiModelChatProps {
  projectId: string
}

export function MultiModelChat({ projectId }: MultiModelChatProps) {
  const {
    sessions,
    currentSessionId,
    isStreaming,
    sendMessage,
    updateSessionModels,
    loadSessions,
    selectSession,
  } = useChatStore()

  const { mode, setMode, selectedAgentIds, toggleAgent, compareVotes, vote } = useChatModeStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  const session = sessions.find(s => s.id === currentSessionId)

  // Load sessions on mount
  useEffect(() => {
    loadSessions(projectId)
  }, [projectId, loadSessions])

  // Sync mode with session type
  useEffect(() => {
    if (session) {
      if (session.type === 'compare') setMode('compare')
      else if (session.type === 'agent-discuss') setMode('agent-discuss')
      else setMode('single')
    }
  }, [session?.type, setMode])

  // Scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [session?.messages, session?.messages?.length])

  const handleSend = (content: string) => {
    sendMessage(content, projectId)
  }

  const handleModelChange = (index: number, modelId: string) => {
    if (!session) return
    const newModelIds = [...session.modelIds]
    newModelIds[index] = modelId
    updateSessionModels(session.id, newModelIds)
  }

  const selectedAgents = selectedAgentIds
    .map(id => AGENT_ROLES.find(r => r.id === id))
    .filter(Boolean) as AgentRole[]

  if (!session) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[var(--bg-base)]">
        <EmptyState
          icon={<Bot className="w-16 h-16" />}
          title="选择或创建一个对话开始"
          description="在左侧创建新对话"
        />
      </div>
    )
  }

  const isCompareMode = mode === 'compare'
  const isAgentMode = mode === 'agent-discuss'

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--bg-base)]">
      {/* Header row: ModeSwitcher + session info */}
      <header className="shrink-0 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <div className="flex items-center gap-4 px-4 py-3">
          <ModeSwitcher />
          <div className="flex-1" />
          {/* Session title */}
          <h2 className="text-sm font-medium text-[var(--text-primary)] truncate max-w-xs">
            {session.title}
          </h2>
          <span
            className={cn(
              'text-xs px-2 py-0.5 rounded-full shrink-0',
              isCompareMode
                ? 'bg-[var(--accent-purple)]/15 text-[var(--accent-purple)]'
                : isAgentMode
                ? 'bg-[var(--accent-green)]/15 text-[var(--accent-green)]'
                : 'bg-[var(--accent-blue)]/15 text-[var(--accent-blue)]'
            )}
          >
            {isCompareMode ? '模型对比' : isAgentMode ? 'Agent 讨论' : '单模型'}
          </span>
        </div>

        {/* Chat header: model selectors */}
        <div className="flex items-center gap-3 px-4 pb-3">
          {isCompareMode ? (
            <>
              {session.modelIds.map((modelId, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  {idx > 0 && <span className="text-xs text-[var(--text-muted)]">vs</span>}
                  <ModelSelector
                    value={modelId}
                    onChange={mid => handleModelChange(idx, mid)}
                  />
                </div>
              ))}
            </>
          ) : isAgentMode ? (
            <span className="text-xs text-[var(--text-muted)]">
              Agent 讨论模式 — 在下方选择参与角色
            </span>
          ) : (
            session.modelIds[0] && (
              <ModelSelector
                value={session.modelIds[0]}
                onChange={mid => handleModelChange(0, mid)}
              />
            )
          )}
        </div>
      </header>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto py-4">
          {isCompareMode ? (
            <CompareView
              messages={session.messages}
              modelIds={session.modelIds}
            />
          ) : isAgentMode ? (
            <AgentDiscussion
              projectId={projectId}
              selectedAgents={selectedAgents}
              onAgentsChange={(agents) => {
                // Sync with mode store
                const ids = agents.map(a => a.id)
                ids.forEach(id => {
                  if (!selectedAgentIds.includes(id)) toggleAgent(id)
                })
                selectedAgentIds.forEach(id => {
                  if (!ids.includes(id)) toggleAgent(id)
                })
              }}
            />
          ) : (
            // Single mode
            <div className="space-y-0">
              {session.messages.length === 0 ? (
                <EmptyState
                  icon={<Bot className="w-16 h-16" />}
                  title="开始对话"
                  description="输入问题，与 AI 展开讨论"
                />
              ) : (
                session.messages.map(msg => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    modelName={msg.modelId ? getModelName(msg.modelId) : undefined}
                  />
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Input area — only for single/compare mode */}
      {!isAgentMode && (
        <ChatInput
          onSend={handleSend}
          disabled={isStreaming}
        />
      )}
    </div>
  )
}
