'use client'

/**
 * AgentList — Agent 选择列表组件
 * Phase 2 手动 Agent 调用
 */

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import { useAgentStore } from './lib/agent-store'
import { agentService } from './lib/agent-service'
import type { AgentDefinition } from './lib/agent-service'

// 内置 Agent 颜色映射
const COLOR_MAP: Record<string, string> = {
  '#3b82f6': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  '#8b5cf6': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  '#ef4444': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  '#10b981': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  '#f59e0b': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
}

function getAgentColor(agent: AgentDefinition) {
  if (agent.color) {
    return COLOR_MAP[agent.color] ?? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
  }
  return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
}

// ── Agent 卡片 ────────────────────────────────────────────────────────────────

interface AgentCardProps {
  agent: AgentDefinition
  isSelected: boolean
  onSelect: () => void
}

function AgentCard({ agent, isSelected, onSelect }: AgentCardProps) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-3 rounded-lg border transition-all ${
        isSelected
          ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-400'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-indigo-300 hover:bg-indigo-50/50 dark:hover:bg-gray-700'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            {agent.avatar ? (
              <span className="text-base">{agent.avatar}</span>
            ) : (
              <span className={`inline-block w-6 h-6 rounded-full text-xs flex items-center justify-center font-bold text-white ${getAgentColor(agent)}`}
                style={{ backgroundColor: agent.color ?? '#6366f1' }}
              >
                {agent.name[0]}
              </span>
            )}
            <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
              {agent.name}
            </span>
            {agent.isBuiltIn && (
              <span className="text-[10px] px-1 py-0.5 rounded bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                内置
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
            {agent.description ?? agent.roleLabel}
          </p>
        </div>
      </div>
    </button>
  )
}

// ── 创建/编辑弹窗 ─────────────────────────────────────────────────────────────

interface AgentFormModalProps {
  agent?: AgentDefinition | null
  projectId?: string
  onClose: () => void
  onSave: (agent: AgentDefinition) => void
}

function AgentFormModal({ agent, projectId, onClose, onSave }: AgentFormModalProps) {
  const [name, setName] = useState(agent?.name ?? '')
  const [roleLabel, setRoleLabel] = useState(agent?.roleLabel ?? '')
  const [description, setDescription] = useState(agent?.description ?? '')
  const [systemPrompt, setSystemPrompt] = useState(agent?.systemPrompt ?? '')
  const [defaultModel, setDefaultModel] = useState(agent?.defaultModel ?? 'gpt-4o')
  const [color, setColor] = useState(agent?.color ?? '#6366f1')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const COLORS = ['#3b82f6', '#8b5cf6', '#ef4444', '#10b981', '#f59e0b', '#6366f1']

  const handleSave = async () => {
    if (!name.trim() || !roleLabel.trim() || !systemPrompt.trim()) {
      setError('名称、角色标签和系统提示词是必填项')
      return
    }
    setSaving(true)
    setError('')
    try {
      let saved: AgentDefinition
      if (agent?.id) {
        saved = await agentService.updateAgent(agent.id, { name, roleLabel, description, systemPrompt, defaultModel, color })
      } else {
        saved = await agentService.createAgent({ name, roleLabel, description, systemPrompt, defaultModel, color, projectId })
      }
      onSave(saved)
    } catch (err: any) {
      setError(err?.message ?? '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {agent?.id ? '编辑 Agent' : '创建自定义 Agent'}
          </h2>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">名称 *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="如：技术方案评审"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">角色标签 *</label>
            <input value={roleLabel} onChange={e => setRoleLabel(e.target.value)} placeholder="如：技术专家、需求分析师"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">描述</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="简短描述此 Agent 的职责"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">默认模型</label>
            <select value={defaultModel} onChange={e => setDefaultModel(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="gpt-4o">GPT-4o</option>
              <option value="claude-3.5-sonnet">Claude 3.5 Sonnet</option>
              <option value="deepseek-chat">DeepSeek Chat</option>
              <option value="qwen-plus">Qwen Plus</option>
              <option value="glm-4.7">GLM-4.7</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">颜色</label>
            <div className="flex gap-2">
              {COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${color === c ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">系统提示词 *</label>
            <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} rows={6}
              placeholder="定义此 Agent 的角色、职责、行为规则..."
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
            取消
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 主组件 ────────────────────────────────────────────────────────────────────

interface AgentListProps {
  projectId?: string
}

export function AgentList({ projectId }: AgentListProps) {
  const { agents, agentsLoading, selectedAgent, setAgents, setAgentsLoading, selectAgent } = useAgentStore()
  const [showModal, setShowModal] = useState(false)
  const [editingAgent, setEditingAgent] = useState<AgentDefinition | null>(null)
  const [showCustom, setShowCustom] = useState(false)

  useEffect(() => {
    loadAgents()
  }, [projectId])

  const loadAgents = async () => {
    setAgentsLoading(true)
    try {
      const { agents: list } = await agentService.listAgents({ projectId, pageSize: 100 })
      setAgents(list)
    } catch (err) {
      console.error('Failed to load agents', err)
    } finally {
      setAgentsLoading(false)
    }
  }

  const builtInAgents = agents.filter(a => a.isBuiltIn)
  const customAgents = agents.filter(a => !a.isBuiltIn)

  const handleSave = (agent: AgentDefinition) => {
    setShowModal(false)
    setEditingAgent(null)
    loadAgents()
  }

  const handleDelete = async (agent: AgentDefinition) => {
    if (!confirm(`确定删除 Agent「${agent.name}」？`)) return
    try {
      await agentService.deleteAgent(agent.id)
      if (selectedAgent?.id === agent.id) selectAgent(null)
      loadAgents()
    } catch (err) {
      console.error('Failed to delete agent', err)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <h3 className="font-medium text-sm text-gray-700 dark:text-gray-300">选择 Agent</h3>
        <button
          onClick={() => { setEditingAgent(null); setShowModal(true) }}
          className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-indigo-600 dark:text-indigo-400"
          title="创建自定义 Agent"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {agentsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : (
          <>
            {/* 内置 Agent */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 px-1 mb-1.5">
                内置角色
              </p>
              <div className="space-y-1">
                {builtInAgents.map(agent => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    isSelected={selectedAgent?.id === agent.id}
                    onSelect={() => selectAgent(agent)}
                  />
                ))}
              </div>
            </div>

            {/* 自定义 Agent */}
            <div>
              <button
                onClick={() => setShowCustom(v => !v)}
                className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 px-1 mb-1.5 hover:text-gray-600 dark:hover:text-gray-300"
              >
                自定义 ({customAgents.length})
              </button>
              {showCustom && (
                <div className="space-y-1">
                  {customAgents.length === 0 ? (
                    <p className="text-xs text-gray-400 dark:text-gray-500 px-2 py-2">
                      暂无自定义 Agent
                    </p>
                  ) : (
                    customAgents.map(agent => (
                      <div key={agent.id} className="relative group">
                        <AgentCard
                          agent={agent}
                          isSelected={selectedAgent?.id === agent.id}
                          onSelect={() => selectAgent(agent)}
                        />
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingAgent(agent); setShowModal(true) }}
                            className="p-1 rounded bg-white dark:bg-gray-700 shadow-sm border border-gray-200 dark:border-gray-600"
                          >
                            <Pencil className="w-3 h-3 text-gray-500" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(agent) }}
                            className="p-1 rounded bg-white dark:bg-gray-700 shadow-sm border border-gray-200 dark:border-gray-600"
                          >
                            <Trash2 className="w-3 h-3 text-red-500" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <AgentFormModal
          agent={editingAgent}
          projectId={projectId}
          onClose={() => { setShowModal(false); setEditingAgent(null) }}
          onSave={handleSave}
        />
      )}
    </div>
  )
}

