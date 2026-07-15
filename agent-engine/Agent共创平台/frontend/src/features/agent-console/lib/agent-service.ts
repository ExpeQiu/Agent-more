/**
 * Agent Console — API Service
 * Phase 2 前端 API 客户端
 */

import api from '@/lib/api/client'
import { buildApiUrl } from '@/lib/runtime-config'

// ── Types ────────────────────────────────────────────────────────────────────

export interface AgentDefinition {
  id: string
  projectId?: string
  name: string
  roleLabel: string
  description?: string
  systemPrompt: string
  defaultModel?: string
  avatar?: string
  color?: string
  isBuiltIn: boolean
  isActive: boolean
  config: AgentConfig
  createdById?: string
  createdAt: string
  updatedAt: string
}

export interface AgentConfig {
  temperature?: number
  maxTokens?: number
  tools?: ToolDefinition[]
  injectWikiContext?: boolean
  maxTurns?: number
}

export interface ToolDefinition {
  name: string
  description: string
  parameters?: Record<string, unknown>
  type?: 'function' | 'http'
  endpoint?: string
}

export interface AgentSession {
  id: string
  projectId: string
  agentId: string
  conversationId: string
  modelId: string
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
  title: string
  messageCount: number
  lastMessageAt: string
  createdAt: string
  updatedAt: string
}

export interface ConversationMessage {
  id: string
  role: 'system' | 'user' | 'assistant'
  content: string
  modelId?: string
  agentId?: string
  messageType?: string
  status?: string
  createdAt: string
}

// ── SSE Event types (matches backend) ────────────────────────────────────────

export type AgentStreamEvent =
  | { type: 'execution_start'; executionId: string; agentId: string; modelId: string }
  | { type: 'message_delta'; messageId: string; content: string; done: boolean }
  | { type: 'message_end'; messageId: string; fullContent: string }
  | { type: 'tool_call_start'; eventId: string; toolName: string; arguments: string; step: number }
  | { type: 'tool_call_delta'; eventId: string; content: string }
  | { type: 'tool_call_result'; eventId: string; result: string; status: 'success' | 'error'; latencyMs: number }
  | { type: 'tool_call_end'; eventId: string }
  | { type: 'execution_end'; executionId: string; totalLatencyMs: number; inputTokens: number; outputTokens: number }
  | { type: 'error'; message: string; code?: string }

// ── API methods ──────────────────────────────────────────────────────────────

const BASE = '/api/v1/agents'

export const agentService = {
  // 列出所有 Agent
  async listAgents(params?: {
    projectId?: string
    isBuiltIn?: boolean
    search?: string
    page?: number
    pageSize?: number
  }) {
    const res = await api.get(`${BASE}`, { params })
    return res.data as { agents: AgentDefinition[]; pagination: { page: number; pageSize: number; total: number } }
  },

  // 获取单个 Agent
  async getAgent(id: string) {
    const res = await api.get(`${BASE}/${id}`)
    return res.data as AgentDefinition
  },

  // 创建自定义 Agent
  async createAgent(data: Partial<AgentDefinition>) {
    const res = await api.post(`${BASE}`, data)
    return res.data as AgentDefinition
  },

  // 更新 Agent
  async updateAgent(id: string, data: Partial<AgentDefinition>) {
    const res = await api.put(`${BASE}/${id}`, data)
    return res.data as AgentDefinition
  },

  // 删除 Agent
  async deleteAgent(id: string) {
    const res = await api.delete(`${BASE}/${id}`)
    return res.data
  },

  // 执行 Agent（SSE 流式）
  executeAgent(
    data: {
      agentId: string
      conversationId?: string
      projectId?: string
      userMessage: string
      modelId?: string
      wikiContext?: string
      variables?: Record<string, string>
      tools?: ToolDefinition[]
    },
    callbacks: {
      onEvent: (event: AgentStreamEvent) => void
      onError?: (err: Error) => void
    }
  ): () => void {
    const { onEvent, onError } = callbacks

    const controller = new AbortController()
    const url = buildApiUrl(`${BASE}/execute`)

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Execution failed' }))
          onError?.(new Error(err.error ?? 'Execution failed'))
          return
        }

        const reader = res.body?.getReader()
        if (!reader) { onError?.(new Error('No response body')); return }

        const decoder = new TextDecoder()
        let buffer = ''

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''

            for (const line of lines) {
              if (!line.trim() || !line.startsWith('data: ')) continue
              try {
                const event = JSON.parse(line.slice(6)) as AgentStreamEvent
                onEvent(event)
              } catch { /* ignore parse errors */ }
            }
          }
        } catch (err: any) {
          if (err.name !== 'AbortError') {
            onError?.(err)
          }
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          onError?.(err)
        }
      })

    // 返回取消函数
    return () => controller.abort()
  },

  // 获取执行记录
  async getExecution(id: string) {
    const res = await api.get(`${BASE}/executions/${id}`)
    return res.data
  },

  // 列出执行历史
  async listExecutions(params?: { agentId?: string; conversationId?: string; page?: number; pageSize?: number }) {
    const res = await api.get(`${BASE}/executions`, { params })
    return res.data as { executions: any[]; pagination: { page: number; pageSize: number; total: number } }
  },

  // ── Agent Sessions ──────────────────────────────────────────────────────

  async createSession(data: { agentId: string; projectId: string; modelId?: string; title?: string }) {
    const res = await api.post('/api/v1/agent-sessions', data)
    return res.data as AgentSession
  },

  async getSession(id: string) {
    const res = await api.get(`/api/v1/agent-sessions/${id}`)
    return res.data as AgentSession & { messages: ConversationMessage[] }
  },

  async listSessions(params: { projectId: string; agentId?: string; page?: number; pageSize?: number }) {
    const res = await api.get('/api/v1/agent-sessions', { params })
    return res.data as { sessions: AgentSession[]; pagination: { page: number; pageSize: number; total: number } }
  },

  async deleteSession(id: string) {
    const res = await api.delete(`/api/v1/agent-sessions/${id}`)
    return res.data
  },

  async getSessionMessages(sessionId: string, params?: { page?: number; pageSize?: number }) {
    const res = await api.get(`/api/v1/agent-sessions/${sessionId}/messages`, { params })
    return res.data as { messages: ConversationMessage[]; pagination: { page: number; pageSize: number; total: number } }
  },
}
