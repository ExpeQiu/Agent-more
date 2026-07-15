'use client'

/**
 * MessageBubble - 统一消息气泡组件
 * 支持 user / assistant / agent 三种变体
 * 支持 Compare 模式的投票操作
 * 支持流式输出动画
 */

import ReactMarkdown from 'react-markdown'
import { User, Bot, ThumbsUp, MessageCircleQuestion, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatMessage } from './lib/chat-store'
import { AVAILABLE_MODELS, type AgentRole, AGENT_ROLES } from './lib/models'

interface MessageBubbleProps {
  message: ChatMessage
  modelName?: string
  modelProvider?: string
  // Agent mode
  agentRole?: AgentRole
  // Compare mode vote
  vote?: 'up' | 'down' | 'question'
  onVote?: (vote: 'up' | 'down' | 'question') => void
  // Streaming indicator
  isStreaming?: boolean
  // Badge (e.g. 🏆 for winner)
  badge?: string
}

const providerIcons: Record<string, string> = {
  openai: '🔵',
  anthropic: '🟠',
  google: '🟢',
  deepseek: '🔴',
  dashscope: '🟡',
  glm: '🟣',
  minimax: '🩵',
  ollama: '⚫',
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function MessageBubble({
  message,
  modelName,
  modelProvider,
  agentRole,
  vote,
  onVote,
  isStreaming,
  badge,
}: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const isAgent = !!agentRole

  return (
    <div className={cn('flex gap-3 mb-4 w-full', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar */}
      <div
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm',
          isUser
            ? 'bg-[var(--accent-blue)] text-white'
            : isAgent
              ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
              : 'bg-[var(--accent-purple)] text-white'
        )}
      >
        {isUser ? (
          <User className="w-4 h-4" />
        ) : isAgent ? (
          <span>{agentRole.icon}</span>
        ) : (
          <Bot className="w-4 h-4" />
        )}
      </div>

      {/* Content */}
      <div className={cn('flex flex-col max-w-[85%]', isUser ? 'items-end' : 'items-start')}>
        {/* Header: model/agent name + badge */}
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-1 ml-1">
            {isAgent && agentRole ? (
              <span className="text-xs font-medium text-[var(--text-secondary)]">{agentRole.name}</span>
            ) : modelName ? (
              <>
                <span>{providerIcons[modelProvider || ''] || ''}</span>
                <span className="text-xs text-[var(--text-secondary)]">{modelName}</span>
              </>
            ) : null}
            {badge && <span className="text-sm">{badge}</span>}
            <span className="text-xs text-[var(--text-muted)]">{formatTime(message.timestamp)}</span>
          </div>
        )}

        {/* Bubble */}
        <div
          className={cn(
            'px-4 py-2.5 rounded-2xl text-sm leading-relaxed',
            isUser
              ? 'bg-[var(--accent-blue)] text-white rounded-tr-md'
              : 'bg-[var(--bg-surface)] text-[var(--text-primary)] rounded-tl-md border border-[var(--border-subtle)]'
          )}
        >
          {isStreaming ? (
            <div className="flex space-x-1 h-5 items-center">
              <div className="w-1.5 h-1.5 bg-[var(--text-muted)] rounded-full animate-bounce [animation-delay:-0.3s]"></div>
              <div className="w-1.5 h-1.5 bg-[var(--text-muted)] rounded-full animate-bounce [animation-delay:-0.15s]"></div>
              <div className="w-1.5 h-1.5 bg-[var(--text-muted)] rounded-full animate-bounce"></div>
            </div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none break-words min-h-[1rem]">
              {message.content ? (
                <ReactMarkdown>{message.content}</ReactMarkdown>
              ) : message.error ? (
                <span className="text-[var(--error)]">{message.error}</span>
              ) : null}
            </div>
          )}
        </div>

        {/* Vote buttons (Compare mode) */}
        {!isUser && onVote && (
          <div className="flex items-center gap-1 mt-1.5 ml-1">
            {(['up', 'down', 'question'] as const).map(v => {
              const icons = { up: ThumbsUp, down: Search, question: MessageCircleQuestion }
              const labels = { up: '认同', down: '质疑', question: '追问' }
              const Icon = icons[v]
              const isActive = vote === v
              const color = v === 'up' ? 'var(--accent-green)' : v === 'down' ? 'var(--error)' : 'var(--accent-amber)'

              return (
                <button
                  key={v}
                  onClick={() => onVote(v)}
                  className={cn(
                    'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors',
                    isActive
                      ? 'text-white'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  )}
                  style={isActive ? { backgroundColor: color } : undefined}
                >
                  <Icon className="w-3 h-3" />
                  <span>{labels[v]}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export function getModelName(modelId?: string): string {
  if (!modelId) return ''
  return AVAILABLE_MODELS.find(m => m.id === modelId)?.name || modelId
}

export function getAgentRole(agentId: string): AgentRole | undefined {
  return AGENT_ROLES.find(r => r.id === agentId)
}
