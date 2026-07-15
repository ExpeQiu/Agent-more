'use client'

/**
 * DiscussionPage — Main discussion management page
 * Phase 3: Multi-Agent Discussion Module
 */

import { useState, useEffect, type MouseEvent } from 'react'
import { Plus, MessageSquare, Trash2, Settings2, Clock, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDiscussionStore } from './lib/discussion-store'
import { DiscussionConfig } from './DiscussionConfig'
import { DiscussionArena } from './DiscussionArena'
import { DiscussionSummary } from './DiscussionSummary'
import type { CreateDiscussionPayload, DiscussionSession } from './lib/discussion-service'

interface DiscussionPageProps {
  projectId: string
}

export function DiscussionPage({ projectId }: DiscussionPageProps) {
  const {
    discussions,
    currentDiscussion,
    isLoading,
    error,
    loadDiscussions,
    loadDiscussion,
    createDiscussion,
    deleteDiscussion,
  } = useDiscussionStore()

  const [showCreate, setShowCreate] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sidebarTab, setSidebarTab] = useState<'list' | 'summary'>('list')

  useEffect(() => {
    if (projectId) {
      loadDiscussions(projectId)
    }
  }, [projectId, loadDiscussions])

  useEffect(() => {
    if (selectedId) {
      loadDiscussion(selectedId)
    }
  }, [selectedId, loadDiscussion])

  const handleCreate = async (config: CreateDiscussionPayload) => {
    try {
      const discussion = await createDiscussion(config)
      setShowCreate(false)
      setSelectedId(discussion.id)
    } catch (err) {
      console.error('[DiscussionPage] Create failed', err)
    }
  }

  const handleDelete = async (discussionId: string, e: MouseEvent) => {
    e.stopPropagation()
    if (!confirm('确定删除这个讨论？')) return
    await deleteDiscussion(discussionId)
    if (selectedId === discussionId) {
      setSelectedId(null)
    }
  }

  const current = currentDiscussion

  const modeLabel: Record<string, string> = {
    parallel: '⚡ 并行',
    'round-robin': '🔄 轮流',
    debate: '⚔️ 辩论',
  }

  const statusLabel: Record<string, string> = {
    PENDING: '待开始',
    RUNNING: '进行中',
    PAUSED: '已暂停',
    COMPLETED: '已完成',
    CANCELLED: '已取消',
  }

  return (
    <div className="flex h-full gap-0">
      {/* Left Sidebar */}
      <div className="w-80 shrink-0 flex flex-col border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              多 Agent 讨论
            </h2>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              新建
            </button>
          </div>

          {/* Tab Switch */}
          <div className="flex gap-1 p-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <button
              onClick={() => setSidebarTab('list')}
              className={cn(
                'flex-1 py-1 text-xs font-medium rounded-md transition-colors',
                sidebarTab === 'list'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              )}
            >
              讨论列表
            </button>
            <button
              onClick={() => setSidebarTab('summary')}
              className={cn(
                'flex-1 py-1 text-xs font-medium rounded-md transition-colors',
                sidebarTab === 'summary'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              )}
            >
              总结
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && discussions.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
              加载中...
            </div>
          ) : sidebarTab === 'list' ? (
            discussions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center p-4">
                <MessageSquare className="w-10 h-10 text-gray-200 dark:text-gray-700 mb-2" />
                <p className="text-sm text-gray-500">暂无讨论</p>
                <button
                  onClick={() => setShowCreate(true)}
                  className="mt-2 text-xs text-indigo-600 hover:text-indigo-700"
                >
                  创建第一个讨论
                </button>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {discussions.map(disc => (
                  <button
                    key={disc.id}
                    onClick={() => setSelectedId(disc.id)}
                    className={cn(
                      'w-full text-left p-3 rounded-lg transition-colors group',
                      selectedId === disc.id
                        ? 'bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800 border border-transparent'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className={cn(
                          'text-sm font-medium truncate',
                          selectedId === disc.id
                            ? 'text-indigo-700 dark:text-indigo-300'
                            : 'text-gray-900 dark:text-gray-100'
                        )}>
                          {disc.topic}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-gray-400">{modeLabel[disc.mode]}</span>
                          <span className="text-xs text-gray-400">•</span>
                          <span className="text-xs text-gray-400">{statusLabel[disc.status]}</span>
                        </div>
                      </div>
                      <button
                        onClick={e => handleDelete(disc.id, e)}
                        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Meta row */}
                    <div className="flex items-center gap-1 mt-1.5">
                      <Clock className="w-3 h-3 text-gray-300" />
                      <span className="text-[10px] text-gray-400">
                        {new Date(disc.createdAt).toLocaleDateString('zh-CN')}
                      </span>
                      <ChevronRight className="w-3 h-3 text-gray-300 ml-auto" />
                    </div>
                  </button>
                ))}
              </div>
            )
          ) : (
            /* Summary tab */
            <div className="p-3">
              {current ? (
                <DiscussionSummary discussion={current} compact={false} />
              ) : (
                <div className="flex flex-col items-center justify-center h-48 text-center text-gray-400 text-sm">
                  <MessageSquare className="w-8 h-8 opacity-20 mb-2" />
                  <p>选择一个讨论查看总结</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {current ? (
          <div className="flex-1 flex flex-col p-4 gap-4">
            {/* Arena */}
            <div className="flex-1 min-h-0">
              <DiscussionArena discussion={current} />
            </div>

            {/* Summary (below arena) */}
            {current.status === 'COMPLETED' && sidebarTab !== 'summary' && (
              <div className="shrink-0">
                <DiscussionSummary discussion={current} compact />
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
              <MessageSquare className="w-8 h-8 text-gray-300 dark:text-gray-600" />
            </div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
              选择或创建一个讨论
            </h3>
            <p className="text-sm text-gray-500 max-w-xs">
              从左侧列表选择一个讨论查看详情，或创建新的讨论开始多 Agent 对话
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              新建讨论
            </button>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && projectId && (
        <DiscussionConfig
          projectId={projectId}
          conversationId={`conv-${projectId}-${Date.now()}`}
          onConfirm={handleCreate}
          onCancel={() => setShowCreate(false)}
          mode="create"
        />
      )}
    </div>
  )
}
