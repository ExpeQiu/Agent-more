'use client'

/**
 * CompareView - 多模型对比视图
 * - 每列顶部显示模型厂商图标 + 名称 + 上下文窗口
 * - 每条回复底部增加 [认同] [质疑] [追问] 快捷操作
 * - 优胜标记：用户点击"认同"后，该列顶部出现 🏆 徽章
 * - 列宽可拖拽调整（预留）
 */

import ReactMarkdown from 'react-markdown'
import { Bot, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AVAILABLE_MODELS } from './lib/models'
import type { ChatMessage } from './lib/chat-store'
import { useChatModeStore } from '@/stores/chat-mode-store'

interface CompareViewProps {
  messages: ChatMessage[]
  modelIds: string[]
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

function formatContextWindow(window: number): string {
  if (window >= 1000000) return `${(window / 1000000).toFixed(0)}M`
  if (window >= 1000) return `${(window / 1000).toFixed(0)}K`
  return window.toString()
}

function getModelInfo(modelId: string) {
  const model = AVAILABLE_MODELS.find(m => m.id === modelId)
  return {
    name: model?.name || modelId,
    provider: model?.provider || 'unknown',
    contextWindow: model?.contextWindow || 0,
    description: model?.description || '',
  }
}

export function CompareView({ messages, modelIds }: CompareViewProps) {
  const { compareVotes, vote } = useChatModeStore()

  // Group messages: user → parallel assistants
  const groups: { user?: ChatMessage; assistants: ChatMessage[] }[] = []
  let currentGroup: { user?: ChatMessage; assistants: ChatMessage[] } = { assistants: [] }

  messages.forEach(msg => {
    if (msg.role === 'user') {
      if (currentGroup.user || currentGroup.assistants.length > 0) {
        groups.push(currentGroup)
      }
      currentGroup = { user: msg, assistants: [] }
    } else {
      currentGroup.assistants.push(msg)
    }
  })
  if (currentGroup.user || currentGroup.assistants.length > 0) {
    groups.push(currentGroup)
  }

  // Determine winner for each group (model with most 'up' votes)
  const groupWinners = groups.map(group => {
    const votes: Record<string, number> = {}
    group.assistants.forEach(msg => {
      if (msg.modelId && compareVotes[msg.id] === 'up') {
        votes[msg.modelId] = (votes[msg.modelId] || 0) + 1
      }
    })
    const winner = Object.entries(votes).sort((a, b) => b[1] - a[1])[0]
    return winner ? winner[0] : null
  })

  return (
    <div className="space-y-6">
      {groups.map((group, groupIdx) => {
        const winner = groupWinners[groupIdx]

        return (
          <div key={groupIdx} className="space-y-4">
            {/* User Message */}
            {group.user && (
              <div className="flex justify-end px-4">
                <div className="bg-[var(--accent-blue)] text-white px-4 py-2.5 rounded-2xl rounded-tr-md max-w-[80%] text-sm">
                  {group.user.content}
                </div>
              </div>
            )}

            {/* Assistant Messages — side by side grid */}
            {group.assistants.length > 0 && (
              <div
                className={cn(
                  'grid gap-4',
                  modelIds.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-3',
                  modelIds.length === 1 && 'grid-cols-1'
                )}
              >
                {group.assistants.map(msg => {
                  const modelInfo = msg.modelId ? getModelInfo(msg.modelId) : null
                  const isWinner = msg.modelId === winner

                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        'rounded-xl border overflow-hidden min-h-[140px] flex flex-col',
                        'bg-[var(--bg-surface)] border-[var(--border-subtle)]'
                      )}
                    >
                      {/* Model header */}
                      <div
                        className={cn(
                          'flex items-center gap-2 px-4 py-3 border-b',
                          'border-[var(--border-subtle)]'
                        )}
                        style={{
                          backgroundColor: isWinner ? 'rgba(34, 197, 94, 0.08)' : 'var(--bg-elevated)',
                        }}
                      >
                        {modelInfo && (
                          <>
                            <span className="text-sm">{providerIcons[modelInfo.provider]}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-[var(--text-primary)] truncate">
                                {modelInfo.name}
                              </div>
                              <div className="text-xs text-[var(--text-muted)]">
                                上下文 {formatContextWindow(modelInfo.contextWindow)}
                              </div>
                            </div>
                            {isWinner && (
                              <div className="flex items-center gap-1 text-xs text-[var(--success)]">
                                <Trophy className="w-3.5 h-3.5" />
                                <span>领先</span>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 p-4">
                        <div className="prose prose-sm dark:prose-invert max-w-none min-h-[1.5rem] text-[var(--text-primary)]">
                          {msg.content ? (
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          ) : msg.error ? (
                            <span className="text-[var(--error)]">{msg.error}</span>
                          ) : (
                            <div className="flex space-x-1 h-5 items-center">
                              <div className="w-1.5 h-1.5 bg-[var(--text-muted)] rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                              <div className="w-1.5 h-1.5 bg-[var(--text-muted)] rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                              <div className="w-1.5 h-1.5 bg-[var(--text-muted)] rounded-full animate-bounce"></div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Vote actions */}
                      <div className="flex items-center gap-1 px-4 pb-3">
                        {(['up', 'down', 'question'] as const).map(v => {
                          const labels = { up: '认同', down: '质疑', question: '追问' }
                          const isActive = compareVotes[msg.id] === v
                          const colors = {
                            up: 'var(--success)',
                            down: 'var(--error)',
                            question: 'var(--accent-amber)',
                          }

                          return (
                            <button
                              key={v}
                              onClick={() => vote(msg.id, v)}
                              className={cn(
                                'flex items-center gap-1 px-2.5 py-1 rounded-full text-xs transition-colors',
                                isActive
                                  ? 'text-white'
                                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                              )}
                              style={isActive ? { backgroundColor: colors[v] } : undefined}
                            >
                              {labels[v]}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
