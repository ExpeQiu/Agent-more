'use client'

/**
 * AppSidebar - 可折叠侧边栏
 * 从 ChatSidebar 抽离，支持折叠/展开状态
 */

import { useEffect } from 'react'
import { Bot, MessageSquare, Layers, Plus, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { useChatStore, type ChatSession } from '@/features/ai-chat/lib/chat-store'
import { useAppUIStore } from '@/stores/app-ui-store'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface AppSidebarProps {
  projectId: string
  currentSessionId: string | null
  onSelectSession: (id: string) => void
}

export function AppSidebar({ projectId, currentSessionId, onSelectSession }: AppSidebarProps) {
  const { sessions, createSession, deleteSession } = useChatStore()
  const { sidebarCollapsed, toggleSidebar } = useAppUIStore()

  const projectSessions = sessions.filter(s => s.projectId === projectId)

  const handleCreateSession = (type: 'single' | 'compare' | 'agent-discuss') => {
    createSession(projectId, type)
  }

  const typeLabel = (type: string) => {
    if (type === 'compare') return { label: '模型对比', icon: Layers, color: 'purple' }
    if (type === 'agent-discuss') return { label: 'Agent讨论', icon: Bot, color: 'green' }
    return { label: '单模型', icon: MessageSquare, color: 'blue' }
  }

  return (
    <aside
      className={cn(
        'relative flex flex-col h-full shrink-0 border-r transition-all duration-200 ease-in-out',
        'bg-[var(--sidebar-bg)] border-[var(--sidebar-border)]',
        sidebarCollapsed ? 'w-14' : 'w-56'
      )}
    >
      {/* Collapse toggle */}
      <button
        onClick={toggleSidebar}
        className={cn(
          'absolute -right-3 top-20 z-10 w-6 h-6 rounded-full flex items-center justify-center',
          'bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-secondary)]',
          'hover:text-[var(--text-primary)] hover:bg-[var(--accent-blue)] hover:border-[var(--accent-blue)]',
          'transition-all duration-200'
        )}
      >
        {sidebarCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>

      {/* Header */}
      <div className={cn('p-4 border-b border-[var(--sidebar-border)]', sidebarCollapsed && 'p-2')}>
        {!sidebarCollapsed ? (
          <h1 className="text-lg font-bold flex items-center gap-2 text-[var(--text-primary)]">
            <Bot className="w-5 h-5 text-[var(--accent-blue)]" />
            AI 对话
          </h1>
        ) : (
          <Tooltip content="AI 对话" side="right">
            <Bot className="w-5 h-5 text-[var(--accent-blue)] mx-auto" />
          </Tooltip>
        )}
      </div>

      {/* Create buttons */}
      <div className={cn('p-2 space-y-1', sidebarCollapsed && 'p-1')}>
        {!sidebarCollapsed ? (
          <>
            <button
              onClick={() => handleCreateSession('single')}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium',
                'bg-[var(--accent-blue)] text-white hover:opacity-90',
                'transition-colors'
              )}
            >
              <MessageSquare className="w-4 h-4" />
              新建对话
            </button>
            <button
              onClick={() => handleCreateSession('compare')}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium',
                'bg-[var(--accent-purple)] text-white hover:opacity-90',
                'transition-colors'
              )}
            >
              <Layers className="w-4 h-4" />
              模型对比
            </button>
            <button
              onClick={() => handleCreateSession('agent-discuss')}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium',
                'bg-[var(--accent-green)] text-white hover:opacity-90',
                'transition-colors'
              )}
            >
              <Plus className="w-4 h-4" />
              Agent 讨论
            </button>
          </>
        ) : (
          <>
            <Tooltip content="新建对话" side="right">
              <button
                onClick={() => handleCreateSession('single')}
                className="w-full p-2 rounded-md bg-[var(--accent-blue)] text-white hover:opacity-90 flex justify-center"
              >
                <MessageSquare className="w-4 h-4" />
              </button>
            </Tooltip>
            <Tooltip content="模型对比" side="right">
              <button
                onClick={() => handleCreateSession('compare')}
                className="w-full p-2 rounded-md bg-[var(--accent-purple)] text-white hover:opacity-90 flex justify-center mt-1"
              >
                <Layers className="w-4 h-4" />
              </button>
            </Tooltip>
            <Tooltip content="Agent 讨论" side="right">
              <button
                onClick={() => handleCreateSession('agent-discuss')}
                className="w-full p-2 rounded-md bg-[var(--accent-green)] text-white hover:opacity-90 flex justify-center mt-1"
              >
                <Plus className="w-4 h-4" />
              </button>
            </Tooltip>
          </>
        )}
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {!sidebarCollapsed && (
          <div className="px-3 py-2 text-xs font-semibold text-[var(--text-muted)] uppercase">
            最近对话
          </div>
        )}
        <div className="space-y-0.5 px-1">
          {projectSessions.map(session => {
            const { label, icon: Icon, color } = typeLabel(session.type)
            const isActive = session.id === currentSessionId
            const colorClass = color === 'blue' ? 'var(--accent-blue)' : color === 'purple' ? 'var(--accent-purple)' : 'var(--accent-green)'

            return (
              <div key={session.id} className="relative group">
                {sidebarCollapsed ? (
                  <Tooltip content={session.title || label} side="right">
                    <button
                      onClick={() => onSelectSession(session.id)}
                      className={cn(
                        'w-full p-2 rounded-md flex justify-center transition-colors',
                        isActive
                          ? 'bg-[var(--sidebar-item-active)] text-[var(--text-primary)]'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--sidebar-item-hover)] hover:text-[var(--text-primary)]'
                      )}
                    >
                      <Icon className="w-4 h-4" style={{ color: isActive ? colorClass : undefined }} />
                    </button>
                  </Tooltip>
                ) : (
                  <button
                    onClick={() => onSelectSession(session.id)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors text-left',
                      isActive
                        ? 'bg-[var(--sidebar-item-active)] text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--sidebar-item-hover)] hover:text-[var(--text-primary)]'
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" style={{ color: isActive ? colorClass : undefined }} />
                    <span className="truncate flex-1">{session.title || label}</span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
                      style={{ backgroundColor: `${colorClass}20`, color: colorClass }}
                    >
                      {label}
                    </span>
                  </button>
                )}
                {/* Delete button */}
                {!sidebarCollapsed && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteSession(session.id)
                    }}
                    className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--error)] hover:text-white transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
