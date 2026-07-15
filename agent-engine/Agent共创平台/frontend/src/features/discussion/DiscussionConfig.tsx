/**
 * DiscussionConfig — Create / Edit Discussion Configuration Modal
 * Phase 3: Multi-Agent Discussion Module
 */

import { useState } from 'react'
import { X, Bot, Plus, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AGENT_ROLES, type AgentRole } from '../ai-chat/lib/models'
import type { CreateDiscussionPayload } from './lib/discussion-service'

interface DiscussionConfigProps {
  projectId: string
  conversationId: string
  onConfirm: (config: CreateDiscussionPayload) => void
  onCancel: () => void
  initialConfig?: Partial<CreateDiscussionPayload>
  mode?: 'create' | 'edit'
}

type DiscussionMode = 'parallel' | 'round-robin' | 'debate'

const MODE_OPTIONS: { value: DiscussionMode; label: string; icon: string; description: string }[] = [
  {
    value: 'parallel',
    label: '并行模式',
    icon: '⚡',
    description: '所有参与者同时作答，最终汇总',
  },
  {
    value: 'round-robin',
    label: '轮流发言',
    icon: '🔄',
    description: '按顺序轮流发言，支持多轮深入讨论',
  },
  {
    value: 'debate',
    label: '辩论模式',
    icon: '⚔️',
    description: '正反方结构化辩论，支持裁判和主持人',
  },
]

export function DiscussionConfig({
  projectId,
  conversationId,
  onConfirm,
  onCancel,
  initialConfig,
  mode = 'create',
}: DiscussionConfigProps) {
  const [topic, setTopic] = useState(initialConfig?.topic || '')
  const [modeValue, setModeValue] = useState<DiscussionMode>(initialConfig?.mode || 'round-robin')
  const [maxRounds, setMaxRounds] = useState(initialConfig?.maxRounds || 3)
  const [selectedAgents, setSelectedAgents] = useState<string[]>(initialConfig?.participantIds || [])
  const [moderatorId, setModeratorId] = useState<string>(initialConfig?.moderatorAgentId || '')
  const [showAgentPicker, setShowAgentPicker] = useState(false)

  const availableAgents = AGENT_ROLES.filter(r => !selectedAgents.includes(r.id))

  const handleConfirm = () => {
    if (!topic.trim()) return
    if (selectedAgents.length < 2) return

    onConfirm({
      projectId,
      conversationId,
      topic: topic.trim(),
      mode: modeValue,
      maxRounds,
      participantIds: selectedAgents,
      moderatorAgentId: moderatorId || undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {mode === 'create' ? '创建讨论' : '编辑讨论'}
            </h2>
          </div>
          <button onClick={onCancel} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Topic */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              讨论话题 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="例如：是否应该在大模型中使用 RAG 技术？"
              rows={3}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          {/* Mode */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              讨论模式
            </label>
            <div className="grid grid-cols-3 gap-2">
              {MODE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setModeValue(opt.value)}
                  className={cn(
                    'flex flex-col items-center gap-1 p-3 rounded-lg border text-center transition-all',
                    modeValue === opt.value
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-600 dark:text-gray-400'
                  )}
                >
                  <span className="text-xl">{opt.icon}</span>
                  <span className="text-xs font-medium">{opt.label}</span>
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-gray-500">
              {MODE_OPTIONS.find(m => m.value === modeValue)?.description}
            </p>
          </div>

          {/* Max Rounds */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              最大轮次：<span className="font-semibold">{maxRounds}</span>
            </label>
            <input
              type="range"
              min={1}
              max={10}
              value={maxRounds}
              onChange={e => setMaxRounds(parseInt(e.target.value))}
              className="w-full accent-indigo-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>1轮</span>
              <span>10轮</span>
            </div>
          </div>

          {/* Participants */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              参与角色 <span className="text-red-500">*</span>
              <span className="text-xs text-gray-400 font-normal ml-1">（至少2个）</span>
            </label>

            <div className="flex flex-wrap gap-2 min-h-[36px]">
              {selectedAgents.map(agentId => {
                const agent = AGENT_ROLES.find(a => a.id === agentId)
                if (!agent) return null
                return (
                  <div
                    key={agentId}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border',
                      agent.color === 'blue' && 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
                      agent.color === 'green' && 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800',
                      agent.color === 'purple' && 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800',
                      agent.color === 'red' && 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
                      agent.color === 'amber' && 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
                    )}
                  >
                    <span>{agent.icon}</span>
                    <span>{agent.name}</span>
                    {moderatorId === agentId && <span className="text-[10px] ml-1 opacity-70">(主持)</span>}
                    <button
                      onClick={() => {
                        setSelectedAgents(prev => prev.filter(id => id !== agentId))
                        if (moderatorId === agentId) setModeratorId('')
                      }}
                      className="ml-1 hover:opacity-70"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )
              })}

              {availableAgents.length > 0 && (
                <button
                  onClick={() => setShowAgentPicker(v => !v)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  添加角色
                </button>
              )}
            </div>

            {/* Agent picker dropdown */}
            {showAgentPicker && (
              <div className="mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2 space-y-1">
                {availableAgents.map(agent => (
                  <button
                    key={agent.id}
                    onClick={() => {
                      setSelectedAgents(prev => [...prev, agent.id])
                      setShowAgentPicker(false)
                    }}
                    className="w-full flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
                  >
                    <span className="text-lg">{agent.icon}</span>
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{agent.name}</div>
                      <div className="text-xs text-gray-500">{agent.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {selectedAgents.length > 0 && modeValue === 'debate' && (
              <div className="mt-2">
                <label className="block text-xs text-gray-500 mb-1">指定主持人（可选）</label>
                <select
                  value={moderatorId}
                  onChange={e => setModeratorId(e.target.value)}
                  className="w-full rounded border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-2 py-1 text-xs text-gray-900 dark:text-gray-100"
                >
                  <option value="">不指定主持人</option>
                  {selectedAgents.map(id => {
                    const agent = AGENT_ROLES.find(a => a.id === id)
                    return agent ? (
                      <option key={id} value={id}>{agent.icon} {agent.name}</option>
                    ) : null
                  })}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={!topic.trim() || selectedAgents.length < 2}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {mode === 'create' ? '创建讨论' : '保存配置'}
          </button>
        </div>
      </div>
    </div>
  )
}
