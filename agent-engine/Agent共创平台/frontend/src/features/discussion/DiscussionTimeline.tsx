/**
 * DiscussionTimeline — Chronological message timeline grouped by round
 * Phase 3: Multi-Agent Discussion Module
 * Phase 4: Added reflection markers, vote result integration
 */

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import type { DiscussionMessage, DiscussionParticipant } from './lib/discussion-service'

interface VoteResult {
  totalVotes: number
  approve: number
  reject: number
  abstain: number
  averageScore?: number
}

interface DiscussionTimelineProps {
  messages: DiscussionMessage[]
  participants: DiscussionParticipant[]
  currentRound?: number
  isRunning?: boolean
  voteResults?: VoteResult | null
  isDebateMode?: boolean
  debateStage?: string
}

export function DiscussionTimeline({
  messages,
  participants,
  currentRound,
  isRunning,
  voteResults,
  isDebateMode,
  debateStage,
}: DiscussionTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Group messages by round
  const rounds = messages.reduce<Record<number, DiscussionMessage[]>>((acc, msg) => {
    const round = msg.roundIndex || 1
    if (!acc[round]) acc[round] = []
    acc[round].push(msg)
    return acc
  }, {})

  // Detect reflection markers in messages
  const isReflectionRound = (round: number) => {
    return messages.some(m =>
      m.roundIndex === round &&
      m.role === 'system' &&
      (m.content.includes('反思') || m.content.includes('【反思】'))
    )
  }

  // Stage labels for debate mode
  const stageLabels: Record<string, string> = {
    opening: '开场陈述',
    rebuttal: '反驳环节',
    counter: '再反驳',
    closing: '总结陈词',
    adjudication: '裁判评分',
  }

  const sortedRounds = Object.keys(rounds)
    .map(Number)
    .sort((a, b) => a - b)

  const getParticipantColor = (agentId: string) => {
    const p = participants.find(p => p.agentId === agentId)
    return p?.agentColor || '#6b7280'
  }

  const getParticipantName = (agentId: string) => {
    const p = participants.find(p => p.agentId === agentId)
    return p?.agentName || agentId
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-center p-8">
        <div className="text-5xl mb-3 opacity-20">💬</div>
        <p className="text-sm">开始讨论后，这里将显示各方发言</p>
        <p className="text-xs mt-1 opacity-60">消息按轮次和时间顺序排列</p>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto p-4 space-y-6">
        {sortedRounds.map(round => {
          const roundMsgs = rounds[round]
          const isReflRound = isReflectionRound(round)

          return (
            <div key={round} className="space-y-3">
              {/* Round divider */}
              <div className="flex items-center gap-3">
                {isDebateMode && debateStage && (
                  <div className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs">
                    {stageLabels[debateStage] || debateStage}
                  </div>
                )}
                <div className={cn(
                  'px-3 py-1 rounded-full text-xs font-semibold',
                  isReflRound
                    ? 'bg-purple-100 text-purple-700'
                    : round === currentRound
                    ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                )}>
                  {isReflRound ? '🎯 反思环节' : `第 ${round} 轮`}
                  {round === currentRound && isRunning && (
                    <span className="ml-1 inline-block w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
                  )}
                </div>
                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
              </div>

              {/* Reflection indicator */}
              {isReflRound && (
                <div className="flex items-center gap-2 text-xs text-purple-600 bg-purple-50 px-3 py-2 rounded-lg border border-purple-200">
                  <span>💭</span>
                  <span>请各位参与者反思自己的观点是否有盲点</span>
                </div>
              )}

              {/* Messages in this round */}
              {roundMsgs
                .sort((a, b) => a.turnIndex - b.turnIndex)
                .map(msg => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    color={getParticipantColor(msg.agentId)}
                    name={getParticipantName(msg.agentId)}
                  />
                ))}
            </div>
          )
        })}

        {/* Streaming indicator */}
        {isRunning && messages[messages.length - 1]?.isStreaming && (
          <div className="flex items-center gap-2 text-xs text-gray-400 pl-4">
            <div className="flex gap-1">
              <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
            </div>
            <span>正在生成...</span>
          </div>
        )}

        {/* Vote Results (shown at end) */}
        {voteResults && !isRunning && (
          <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200">
            <div className="font-medium text-sm text-gray-800 mb-3 flex items-center gap-2">
              <span>🗳️</span>
              投票结果
            </div>
            {voteResults.averageScore !== undefined ? (
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">
                  {voteResults.averageScore.toFixed(1)}
                </div>
                <div className="text-xs text-gray-500">平均评分 (满分5分)</div>
              </div>
            ) : (
              <div className="space-y-2">
                {[
                  { label: '支持', value: voteResults.approve, color: 'bg-green-500' },
                  { label: '反对', value: voteResults.reject, color: 'bg-red-500' },
                  { label: '弃权', value: voteResults.abstain, color: 'bg-gray-400' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="text-sm w-10">{label}</span>
                    <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${color}`}
                        style={{ width: `${(value / Math.max(voteResults.totalVotes, 1)) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium w-6 text-right">{value}</span>
                  </div>
                ))}
                <div className="text-center text-xs text-gray-500 pt-1">
                  共 {voteResults.totalVotes} 票
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Message Bubble ──────────────────────────────────────────────────────────────

interface MessageBubbleProps {
  message: DiscussionMessage
  color: string
  name: string
}

function MessageBubble({ message, color, name }: MessageBubbleProps) {
  const isUser = message.role === 'moderator' || message.agentId === 'manual'
  const isSystem = message.role === 'system'

  if (isSystem) {
    const isReflection = message.content.includes('反思')
    return (
      <div className="flex justify-center">
        <div className={cn(
          'px-4 py-2 rounded-lg text-xs text-center max-w-[80%]',
          isReflection
            ? 'bg-purple-100 text-purple-700 border border-purple-200'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 italic'
        )}>
          {message.content}
        </div>
      </div>
    )
  }

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%]">
          <div className="text-xs text-right text-gray-500 mb-1">{name}</div>
          <div className="bg-indigo-600 text-white px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm whitespace-pre-wrap">
            {message.content}
            {message.isStreaming && (
              <span className="inline-block w-1.5 h-3.5 bg-white/50 ml-0.5 animate-pulse align-middle ml-1" />
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3">
      {/* Avatar */}
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 mt-0.5"
        style={{ backgroundColor: color }}
      >
        {name.charAt(0)}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{name}</span>
          <span className="text-[10px] text-gray-400">
            {message.latencyMs ? `${message.latencyMs}ms` : ''}
          </span>
        </div>
        <div className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
          {message.content}
          {message.isStreaming && (
            <span className="inline-block w-1.5 h-3.5 bg-gray-400 animate-pulse align-middle ml-0.5" />
          )}
        </div>
      </div>
    </div>
  )
}
