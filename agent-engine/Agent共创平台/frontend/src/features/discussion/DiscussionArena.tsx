/**
 * DiscussionArena — Main discussion area with controls and timeline
 * Phase 3: Multi-Agent Discussion Module
 */

import { useEffect } from 'react'
import { Play, Pause, Square, MessageSquare, Users, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDiscussionStore } from './lib/discussion-store'
import { DiscussionTimeline } from './DiscussionTimeline'
import type { DiscussionSession } from './lib/discussion-service'

interface DiscussionArenaProps {
  discussion: DiscussionSession
  onAddMessage?: (content: string) => void
}

export function DiscussionArena({ discussion, onAddMessage }: DiscussionArenaProps) {
  const {
    messages,
    status,
    isRunning,
    isPaused,
    startDiscussion,
    stopDiscussion,
    pauseDiscussion,
    loadMessages,
  } = useDiscussionStore()

  // Load initial messages
  useEffect(() => {
    loadMessages(discussion.id)
  }, [discussion.id, loadMessages])

  const handleStart = () => {
    startDiscussion(discussion.id)
  }

  const handleStop = async () => {
    await stopDiscussion(discussion.id)
  }

  const handlePause = async () => {
    await pauseDiscussion(discussion.id)
  }

  const canStart = discussion.status === 'PENDING' || discussion.status === 'CANCELLED' || discussion.status === 'COMPLETED'
  const canPause = isRunning && !isPaused
  const canStop = isRunning || isPaused

  const modeLabel: Record<string, string> = {
    parallel: '⚡ 并行',
    'round-robin': '🔄 轮流',
    debate: '⚔️ 辩论',
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <div className="flex items-center gap-3 min-w-0">
          {/* Topic */}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate max-w-[400px]">
              {discussion.topic}
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-gray-500">{modeLabel[discussion.mode]}</span>
              <span className="text-xs text-gray-400">•</span>
              <span className="text-xs text-gray-500">
                {status ? `第 ${status.currentRound}/${status.maxRounds} 轮` : `最多 ${discussion.maxRounds} 轮`}
              </span>
              <span className="text-xs text-gray-400">•</span>
              <StatusBadge status={status?.status || discussion.status} isRunning={isRunning} isPaused={isPaused} />
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {canStart && (
            <button
              onClick={handleStart}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <Play className="w-3.5 h-3.5" />
              {discussion.status === 'COMPLETED' ? '重新开始' : '开始'}
            </button>
          )}

          {canPause && (
            <button
              onClick={handlePause}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <Pause className="w-3.5 h-3.5" />
              暂停
            </button>
          )}

          {canStop && (
            <button
              onClick={handleStop}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <Square className="w-3.5 h-3.5" />
              停止
            </button>
          )}
        </div>
      </div>

      {/* Participants Strip */}
      {discussion.participants.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900 overflow-x-auto">
          <div className="flex items-center gap-1 text-xs text-gray-400 shrink-0">
            <Users className="w-3 h-3" />
            <span>参与方：</span>
          </div>
          {discussion.participants.map(p => (
            <div
              key={p.id}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs whitespace-nowrap shrink-0"
              style={{
                backgroundColor: `${p.agentColor}20`,
                color: p.agentColor,
                border: `1px solid ${p.agentColor}40`,
              }}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: p.agentColor }}
              />
              {p.agentName}
              {p.isModerator && <span className="opacity-60 ml-0.5">(主持)</span>}
            </div>
          ))}
        </div>
      )}

      {/* Timeline */}
      <DiscussionTimeline
        messages={messages}
        participants={discussion.participants}
        currentRound={status?.currentRound}
        isRunning={isRunning}
      />
    </div>
  )
}

// ── Status Badge ───────────────────────────────────────────────────────────────

function StatusBadge({
  status,
  isRunning,
  isPaused,
}: {
  status: string
  isRunning: boolean
  isPaused: boolean
}) {
  if (isRunning) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
        进行中
      </span>
    )
  }

  if (isPaused) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
        <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
        已暂停
      </span>
    )
  }

  const map: Record<string, { label: string; cls: string }> = {
    PENDING:     { label: '待开始', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
    COMPLETED:   { label: '已完成', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
    CANCELLED:   { label: '已取消', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
    PAUSED:      { label: '已暂停', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  }

  const cfg = map[status] || { label: status, cls: 'bg-gray-100 text-gray-600' }
  return (
    <span className={cn('px-1.5 py-0.5 rounded-full text-xs font-medium', cfg.cls)}>
      {cfg.label}
    </span>
  )
}
