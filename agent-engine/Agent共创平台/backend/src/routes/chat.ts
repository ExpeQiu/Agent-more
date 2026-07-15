/**
 * 多模型流式聊天 API
 * 对应 muiltchat 的 /api/chat/stream
 * 
 * 支持：
 * - 单模型聊天（model_id）
 * - 多模型并行聊天（model_ids），每个模型独立 SSE 流
 * - 与 Cocreator 认证体系集成
 */

import { Router } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { AVAILABLE_MODELS, type LLMMessage } from '../modules/llm-gateway/types'
import { GoogleAdapter } from '../modules/llm-gateway/adapters/google.adapter'
import { MiniMaxAdapter } from '../modules/llm-gateway/adapters/minimax.adapter'
import { DashScopeAdapter } from '../modules/llm-gateway/adapters/dashscope.adapter'
import { GLMAdapter } from '../modules/llm-gateway/adapters/glm.adapter'
import { OllamaAdapter } from '../modules/llm-gateway/adapters/ollama.adapter'
import { DeepSeekAdapter } from '../modules/llm-gateway/adapters/deepseek.adapter'
import { OpenAIAdapter } from '../modules/llm-gateway/adapters/openai.adapter'
import { ClaudeAdapter } from '../modules/llm-gateway/adapters/claude.adapter'
import { LLMStreamChunk } from '../modules/llm-gateway/types'

const router = Router()
router.use(authMiddleware)

// ── Environment ────────────────────────────────────────────────────────────────

const OPENAI_API_KEY    = process.env.OPENAI_API_KEY || ''
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''
const GOOGLE_API_KEY    = process.env.GOOGLE_API_KEY || ''
const DEEPSEEK_API_KEY  = process.env.DEEPSEEK_API_KEY || ''
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || ''
const GLM_API_KEY       = process.env.GLM_API_KEY || ''
const MINIMAX_API_KEY   = process.env.MINIMAX_API_KEY || ''
const MINIMAX_GROUP_ID  = process.env.MINIMAX_GROUP_ID || ''
const OLLAMA_BASE_URL   = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
const OLLAMA_API_KEY    = process.env.OLLAMA_API_KEY || ''

// ── Adapter factory ───────────────────────────────────────────────────────────

function createAdapter(modelId: string) {
  if (modelId.startsWith('gpt-')) {
    return new OpenAIAdapter(OPENAI_API_KEY)
  }
  if (modelId.startsWith('claude-')) {
    return new ClaudeAdapter(ANTHROPIC_API_KEY)
  }
  if (modelId.startsWith('gemini-')) {
    return new GoogleAdapter(GOOGLE_API_KEY)
  }
  if (modelId.startsWith('deepseek-')) {
    return new DeepSeekAdapter(DEEPSEEK_API_KEY)
  }
  if (modelId.startsWith('qwen-') || modelId.startsWith('qwq-')) {
    return new DashScopeAdapter(DASHSCOPE_API_KEY)
  }
  if (modelId.startsWith('glm-')) {
    return new GLMAdapter(GLM_API_KEY)
  }
  if (modelId.startsWith('minimax-') || modelId === 'abab6.5-chat') {
    return new MiniMaxAdapter(MINIMAX_API_KEY, MINIMAX_GROUP_ID)
  }
  if (modelId.includes(':')) {
    return new OllamaAdapter(OLLAMA_BASE_URL, OLLAMA_API_KEY)
  }
  return null
}

// ── Helper: model config ───────────────────────────────────────────────────────

function getModelName(modelId: string): string {
  return AVAILABLE_MODELS.find(m => m.id === modelId)?.name ?? modelId
}

function getApiModelName(modelId: string): string {
  return AVAILABLE_MODELS.find(m => m.id === modelId)?.apiName ?? modelId
}

// ── SSE helpers ────────────────────────────────────────────────────────────────

function sse(id: string, event: string, data: unknown): string {
  return `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function sseData(id: string, data: unknown): string {
  return `id: ${id}\ndata: ${JSON.stringify(data)}\n\n`
}

// ── Routes ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/chat/models
 * 返回可用模型列表
 */
router.get('/models', (_req: AuthRequest, res) => {
  res.json({ models: AVAILABLE_MODELS })
})

/**
 * POST /api/v1/chat/stream
 * 流式聊天，支持单模型或多模型并行
 *
 * Request body:
 * - model_id: string (单模型)
 * - model_ids: string[] (多模型并行)
 * - messages: LLMMessage[]
 * - project_id?: string
 */
router.post('/stream', async (req: AuthRequest, res) => {
  const { model_id, model_ids, messages } = req.body as {
    model_id?: string
    model_ids?: string[]
    messages: LLMMessage[]
    project_id?: string
  }

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages is required and must be non-empty' })
    return
  }

  const targetModelIds: string[] = model_ids?.length
    ? model_ids
    : model_id
      ? [model_id]
      : ['gpt-4o']

  // 验证所有模型都有适配器
  const invalidModels = targetModelIds.filter(id => !createAdapter(id))
  if (invalidModels.length > 0) {
    res.status(400).json({
      error: `未配置以下模型的 API Key: ${invalidModels.join(', ')}`,
    })
    return
  }

  // 设置 SSE
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  const flush = () => res.write('')

  // 并行向所有模型发送请求
  const modelStreams = targetModelIds.map(modelId => {
    const adapter = createAdapter(modelId)!
    const apiModel = getApiModelName(modelId)
    const streamId = `model-${modelId}-${Date.now()}`

    const run = async () => {
      try {
        // 发送 model_start 事件
        res.write(sse(streamId, 'model_start', { model_id: modelId, model_name: getModelName(modelId) }))
        flush()

        for await (const chunk of adapter.chatStream!({
          model: apiModel,
          messages,
          temperature: 0.7,
          maxTokens: 4096,
        })) {
          res.write(sseData(streamId, {
            model_id: modelId,
            content: chunk.content,
            done: chunk.done,
          }))
          flush()
        }

        // 发送 done 事件
        res.write(sse(streamId, 'done', { model_id: modelId }))
        flush()
      } catch (err: any) {
        res.write(sseData(streamId, {
          model_id: modelId,
          error: err?.message || 'Unknown error',
          done: true,
        }))
        flush()
      }
    }

    return { modelId, run }
  })

  // 并发执行所有模型流
  await Promise.allSettled(modelStreams.map(m => m.run()))

  res.end()
})

export default router
