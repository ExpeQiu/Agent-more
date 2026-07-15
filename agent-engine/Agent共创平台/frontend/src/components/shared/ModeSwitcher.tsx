'use client'

/**
 * ModeSwitcher - 统一模式切换 Tab
 * 三个 Pill 按钮：Single / Compare / Agent Discussion
 */

import { MessageSquare, Layers, Bot } from 'lucide-react'
import { useChatModeStore, type ChatMode } from '@/stores/chat-mode-store'
import { cn } from '@/lib/utils'

const modes = [
  {
    value: 'single' as ChatMode,
    label: '单模型',
    icon: MessageSquare,
    color: 'blue',
  },
  {
    value: 'compare' as ChatMode,
    label: '模型对比',
    icon: Layers,
    color: 'purple',
  },
  {
    value: 'agent-discuss' as ChatMode,
    label: 'Agent 讨论',
    icon: Bot,
    color: 'green',
  },
]

export function ModeSwitcher() {
  const { mode, setMode } = useChatModeStore()

  return (
    <div className="flex gap-1 p-1 rounded-lg bg-[var(--bg-surface)]">
      {modes.map(({ value, label, icon: Icon, color }) => {
        const isActive = mode === value
        const colorVar = `var(--accent-${color})`

        return (
          <button
            key={value}
            onClick={() => setMode(value)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
              isActive
                ? 'text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
            )}
            style={isActive ? { backgroundColor: colorVar } : undefined}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
          </button>
        )
      })}
    </div>
  )
}
