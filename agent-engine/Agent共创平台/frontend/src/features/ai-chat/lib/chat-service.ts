/**
 * 聊天 API 服务
 * 对应 muiltchat client/src/lib/chat-service.ts
 */

import { buildApiUrl } from '@/lib/runtime-config'

const API_BASE = '/api/v1'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface SSEChunk {
  model_id: string
  content?: string
  done?: boolean
  error?: string
}

/**
 * 从后端 SSE 流式获取多模型回复
 */
export async function* streamMultiModelChat(
  modelIds: string[],
  messages: ChatMessage[],
  projectId?: string
): AsyncGenerator<SSEChunk, void, unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 600_000) // 10min timeout

  try {
    const response = await fetch(buildApiUrl(`${API_BASE}/chat/stream`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model_ids: modelIds,
        messages,
        project_id: projectId,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const err = await response.text()
      yield { model_id: '', error: `请求失败: ${response.status} ${err}` }
      return
    }

    if (!response.body) {
      yield { model_id: '', error: '无法读取响应流' }
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''

        for (const part of parts) {
          const lines = part.split('\n')
          let eventName = ''
          let payload = ''

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventName = line.slice(7).trim()
            } else if (line.startsWith('data: ')) {
              payload += (payload ? '\n' : '') + line.slice(6)
            }
          }

          if (!payload) continue

          try {
            const data = JSON.parse(payload) as SSEChunk
            yield data
          } catch {}
        }
      }
    } finally {
      reader.releaseLock()
    }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * 保存消息到后端
 */
export async function saveMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  modelId?: string
): Promise<void> {
  await fetch(buildApiUrl(`${API_BASE}/chat/sessions/${sessionId}/messages`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, content, modelId }),
  })
}

/**
 * 创建新会话
 */
export async function createSession(
  projectId: string,
  title: string,
  type: 'single' | 'compare' | 'agent-discuss',
  modelIds: string[]
): Promise<{ id: string }> {
  const res = await fetch(buildApiUrl(`${API_BASE}/chat/sessions`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, title, type, modelIds }),
  })
  const data = await res.json()
  return data.session
}

/**
 * 获取会话列表
 */
export async function listSessions(
  projectId: string,
  type?: 'single' | 'compare' | 'agent-discuss'
): Promise<any[]> {
  const params = new URLSearchParams({ projectId })
  if (type) params.set('type', type)
  const res = await fetch(buildApiUrl(`${API_BASE}/chat/sessions?${params}`))
  const data = await res.json()
  return data.sessions || []
}

/**
 * 获取会话详情
 */
export async function getSession(sessionId: string): Promise<any> {
  const res = await fetch(buildApiUrl(`${API_BASE}/chat/sessions/${sessionId}`))
  const data = await res.json()
  return data.session
}

/**
 * 删除会话
 */
export async function deleteSession(sessionId: string): Promise<void> {
  await fetch(buildApiUrl(`${API_BASE}/chat/sessions/${sessionId}`), { method: 'DELETE' })
}
