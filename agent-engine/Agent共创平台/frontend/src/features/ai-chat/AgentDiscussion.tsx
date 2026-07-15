'use client'

/**
 * AgentDiscussion - Agent 讨论视图（交织时间线）
 * - Agent 角色以 Pill 标签横向排列，点击 × 可移除
 * - 添加角色改为 Popover（非 absolute 下拉）
 * - 消息以交织式时间线而非分组并排显示
 * - 每条消息显示角色图标+名称+时间戳
 * - 支持 @提及（输入 @ 触发 Agent 选择器）
 */

import { useState, useRef, useEffect } from 'react'
import { Bot, Send, Loader2, RefreshCw, MessageSquarePlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AGENT_ROLES, type AgentRole } from './lib/models'
import { streamMultiModelChat } from './lib/chat-service'
import type { ChatMessage } from './lib/chat-service'
import { AgentRolePicker } from '@/components/shared/AgentRolePicker'
import { EmptyState } from '@/components/shared/EmptyState'
import { useAgentStore } from '@/stores/agent-store'

const AVAILABLE_AGENT_MODEL: Record<string, string> = {
  'tech-expert': 'gpt-4o',
  'product-manager': 'gpt-4o',
  'competitor-analyst': 'gpt-4o',
  'skeptic': 'gpt-4o',
  'synthesizer': 'gpt-4o',
}

const ROLE_COLORS: Record<string, string> = {
  blue: 'var(--accent-blue)',
  green: 'var(--accent-green)',
  purple: 'var(--accent-purple)',
  red: 'var(--error)',
  amber: 'var(--accent-amber)',
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface AgentMessage {
  id: string
  roleId: string
  roleName: string
  roleColor: string
  content: string
  timestamp: number
  error?: string
  isStreaming?: boolean
}

interface AgentDiscussionProps {
  projectId?: string
  selectedAgents: AgentRole[]
  onAgentsChange: (agents: AgentRole[]) => void
}

export function AgentDiscussion({ projectId, selectedAgents, onAgentsChange }: AgentDiscussionProps) {
  const { agentThread, addUserMessage, addAgentMessage, updateAgentMessage, setStreaming, clearThread } = useAgentStore()
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [discussionMode, setDiscussionMode] = useState<'parallel' | 'round-robin'>('parallel')
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [agentThread])

  const streamAgent = async (agent: AgentRole, messageId: string, history: ChatMessage[]) => {
    let content = ''
    try {
      const systemMessages = [
        { role: 'system' as const, content: agent.systemPrompt },
        ...history.slice(-20),
      ]
      const stream = streamMultiModelChat(
        [AVAILABLE_AGENT_MODEL[agent.id] || 'gpt-4o'],
        systemMessages,
        projectId
      )
      for await (const chunk of stream) {
        if (chunk.error) {
          updateAgentMessage(messageId, content + `\n\n[错误: ${chunk.error}]`)
          return
        }
        if (chunk.content !== undefined) {
          content += chunk.content
          updateAgentMessage(messageId, content)
        }
      }
    } catch (err: any) {
      updateAgentMessage(messageId, content + `\n\n[错误: ${err.message}]`)
    }
    setStreaming(agent.id, false)
  }

  const buildHistory = (): ChatMessage[] => {
    return agentThread
      .filter(m => m.agentId === 'user' || (m.agentId !== 'user' && m.content))
      .map(m => ({
        id: m.id,
        role: (m.agentId === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.content,
        modelId: undefined,
        timestamp: m.timestamp,
      }))
  }

  const handleSend = async () => {
    if (!input.trim() || isStreaming || selectedAgents.length === 0) return
    if (abortRef.current) {
      abortRef.current.abort()
    }
    abortRef.current = new AbortController()

    const question = input
    setInput('')
    setIsStreaming(true)
    addUserMessage(question)

    const history = buildHistory()

    if (discussionMode === 'parallel') {
      // 并行模式
      const slots = selectedAgents.map(agent => {
        const msgId = crypto.randomUUID()
        addAgentMessage(agent.id, agent.name, '', agent.icon)
        setStreaming(agent.id, true)
        return { agent, msgId }
      })
      await Promise.allSettled(slots.map(({ agent, msgId }) =>
        streamAgent(agent, msgId, history)
      ))
    } else {
      // 轮询模式
      let accumulated = [...agentThread]
      for (const agent of selectedAgents) {
        const msgId = crypto.randomUUID()
        addAgentMessage(agent.id, agent.name, '', agent.icon)
        setStreaming(agent.id, true)
        const currentHistory = buildHistory()
        await streamAgent(agent, msgId, currentHistory)
        await new Promise(r => setTimeout(r, 600))
      }
    }

    setIsStreaming(false)
  }

  const handleReset = () => {
    if (isStreaming) {
      abortRef.current?.abort()
    }
    clearThread()
    setIsStreaming(false)
    setInput('')
  }

  const toggleAgent = (agentId: string) => {
    if (selectedAgents.find(a => a.id === agentId)) {
      onAgentsChange(selectedAgents.filter(a => a.id !== agentId))
    } else {
      const role = AGENT_ROLES.find(r => r.id === agentId)
      if (role) onAgentsChange([...selectedAgents, role])
    }
  }

  const discussionEnded = agentThread.length > 0 && !isStreaming && agentThread.some(m => m.agentId === 'user')

  return (
    <div className="flex flex-col h-full">
      {/* Agent role pills */}
      <div className="px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-medium text-[var(--text-muted)]">参与 Agent：</span>
          <AgentRolePicker
            selectedIds={selectedAgents.map(a => a.id)}
            onToggle={toggleAgent}
          />
          <div className="flex-1" />

          {/* Mode toggle */}
          <div className="flex items-center gap-1 bg-[var(--bg-elevated)] rounded-lg p-0.5">
            <button
              onClick={() => setDiscussionMode('parallel')}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                discussionMode === 'parallel'
                  ? 'bg-[var(--bg-surface)] shadow-sm text-[var(--text-primary)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              )}
            >
              并行 ⚡
            </button>
            <button
              onClick={() => setDiscussionMode('round-robin')}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                discussionMode === 'round-robin'
                  ? 'bg-[var(--bg-surface)] shadow-sm text-[var(--text-primary)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              )}
            >
              轮询 🔄
            </button>
          </div>

          {agentThread.length > 0 && !isStreaming && (
            <button
              onClick={handleReset}
              className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--error)] hover:bg-[var(--error)]/10 transition-colors"
              title="重置讨论"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Messages — interwoven timeline */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        {agentThread.length === 0 ? (
          <EmptyState
            icon={<Bot className="w-12 h-12" />}
            title="选择 Agent 角色，输入问题开始讨论"
            description="支持并行回复或轮询轮流讨论，结束后可追问"
          />
        ) : (
          <div className="max-w-3xl mx-auto space-y-4">
            {agentThread.map((msg, idx) => {
              const isUser = msg.agentId === 'user'
              const agentRole = selectedAgents.find(a => a.id === msg.agentId)
              const color = isUser ? 'var(--accent-blue)' : ROLE_COLORS[agentRole?.color || 'blue']

              return (
                <div
                  key={msg.id}
                  className={cn('flex gap-3', isUser && 'flex-row-reverse')}
                >
                  {/* Avatar */}
                  <div
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm',
                      isUser
                        ? 'bg-[var(--accent-blue)] text-white'
                        : 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                    )}
                  >
                    {isUser ? '👤' : (agentRole?.icon || '🤖')}
                  </div>

                  {/* Content */}
                  <div className={cn('flex flex-col max-w-[80%]', isUser && 'items-end')}>
                    {/* Header */}
                    <div className="flex items-center gap-2 mb-1 ml-1">
                      <span className="text-xs font-medium" style={{ color }}>
                        {isUser ? '你' : msg.agentName}
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">{formatTime(msg.timestamp)}</span>
                    </div>

                    {/* Bubble */}
                    <div
                      className={cn(
                        'px-4 py-2.5 rounded-2xl text-sm leading-relaxed',
                        isUser
                          ? 'bg-[var(--accent-blue)] text-white rounded-tr-md'
                          : 'bg-[var(--bg-surface)] text-[var(--text-primary)] rounded-tl-md border border-[var(--border-subtle)]'
                      )}
                    >
                      {msg.isStreaming && !msg.content ? (
                        <div className="flex space-x-1 h-5 items-center">
                          <div className="w-1.5 h-1.5 bg-[var(--text-muted)] rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                          <div className="w-1.5 h-1.5 bg-[var(--text-muted)] rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                          <div className="w-1.5 h-1.5 bg-[var(--text-muted)] rounded-full animate-bounce"></div>
                        </div>
                      ) : msg.error ? (
                        <span className="text-[var(--error)]">{msg.error}</span>
                      ) : (
                        msg.content
                      )}
                    </div>

                    {/* Indent replies */}
                    {!isUser && idx < agentThread.length - 1 && agentThread[idx + 1].agentId !== 'user' && (
                      <div className="ml-3 mt-1 pl-2 border-l-2 border-[var(--border-subtle)] space-y-1">
                        {/* Reply thread indicator */}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Input area */}
      <div
        className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-base)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="max-w-3xl mx-auto">
          {discussionEnded && (
            <div className="flex items-center gap-2 mb-2 text-xs text-[var(--accent-green)]">
              <MessageSquarePlus className="w-3.5 h-3.5" />
              <span>讨论已结束，输入追问继续</span>
            </div>
          )}
          {isStreaming && (
            <div className="flex items-center gap-2 mb-2 text-xs text-[var(--accent-blue)]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{discussionMode === 'parallel' ? '所有 Agent 并行思考中...' : 'Agent 轮流讨论中...'}</span>
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder={
                selectedAgents.length === 0
                  ? '请添加 Agent 角色...'
                  : discussionEnded
                  ? '输入追问，继续讨论...'
                  : '输入问题，Enter 发送...'
              }
              disabled={isStreaming || selectedAgents.length === 0}
              rows={1}
              className={cn(
                'flex-1 resize-none rounded-xl border bg-[var(--bg-surface)]',
                'px-4 py-3 text-sm leading-relaxed',
                'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
                'focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/50',
                'border-[var(--border-default)]',
                (isStreaming || selectedAgents.length === 0) && 'opacity-50'
              )}
              style={{ minHeight: '48px', maxHeight: '200px' }}
            />
            <button
              onClick={handleSend}
              disabled={(!input.trim() && !isStreaming) || selectedAgents.length === 0}
              className={cn(
                'shrink-0 p-3 rounded-xl transition-all',
                input.trim() && selectedAgents.length > 0
                  ? 'bg-[var(--accent-blue)] text-white hover:shadow-[var(--shadow-glow-blue)]'
                  : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] cursor-not-allowed'
              )}
            >
              {isStreaming ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
          <div className="mt-1.5 text-xs text-[var(--text-muted)]">
            {selectedAgents.length} 个 Agent · {discussionMode === 'parallel' ? '并行模式' : '轮询模式'}
          </div>
        </div>
      </div>
    </div>
  )
}
