/**
 * 多模型对比 API
 * 对应合并方案 §10.2 Compare API
 *
 * POST /api/v1/compare/sessions         — 创建对比会话
 * POST /api/v1/compare/:sessionId/runs/stream — 并发多模型流式对比
 * POST /api/v1/compare/:sessionId/select     — 选择最佳答案
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
import prisma from '../config/database'

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
  if (modelId.startsWith('gpt-') || modelId.startsWith('o')) {
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

function getApiModelName(modelId: string): string {
  return AVAILABLE_MODELS.find(m => m.id === modelId)?.apiName ?? modelId
}

function getModelName(modelId: string): string {
  return AVAILABLE_MODELS.find(m => m.id === modelId)?.name ?? modelId
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
 * GET /api/v1/compare/models
 * 返回支持对比的模型列表
 */
router.get('/models', (_req: AuthRequest, res) => {
  res.json({ models: AVAILABLE_MODELS })
})

/**
 * POST /api/v1/compare/sessions
 * 创建对比会话
 *
 * Body: { projectId, title?, modelIds }
 */
router.post('/sessions', async (req: AuthRequest, res) => {
  try {
    const { projectId, title, modelIds } = req.body as {
      projectId: string
      title?: string
      modelIds: string[]
    }

    if (!modelIds || modelIds.length < 2) {
      res.status(400).json({ error: 'modelIds must contain at least 2 models' })
      return
    }

    const session = await prisma.conversationSession.create({
      data: {
        projectId,
        userId: req.userId!,
        skillName: 'compare',
        title: title || '多模型对比',
        type: 'compare',
        modelIds: JSON.stringify(modelIds),
        variables: JSON.stringify({ modelIds, moduleType: 'COMPARE' }),
      } as any,
    })

    res.status(201).json({
      session: { ...session, modelIds },
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * POST /api/v1/compare/:sessionId/runs/stream
 * 并发多模型流式对比（SSE）
 *
 * Body: { messages: LLMMessage[], modelIds?: string[] }
 * Query: compareSessionId — optional; if provided, saves messages to session
 */
router.post('/:sessionId/runs/stream', async (req: AuthRequest, res) => {
  const { sessionId } = req.params
  const { messages, models, modelIds } = req.body as {
    messages: LLMMessage[]
    models?: string[]
    modelIds?: string[]
  }
  // Alias `models` → `modelIds` for backward compatibility
  const initialModelIds = modelIds ?? models ?? []

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages is required and must be non-empty' })
    return
  }

  // Load session to get modelIds if not provided
  let targetModelIds: string[] = initialModelIds
  if (!targetModelIds || targetModelIds.length === 0) {
    const session = await prisma.conversationSession.findFirst({
      where: { id: sessionId, userId: req.userId },
    })
    if (session?.modelIds) {
      targetModelIds = JSON.parse(session.modelIds)
    }
  }

  if (!targetModelIds || targetModelIds.length < 2) {
    res.status(400).json({ error: 'At least 2 models are required for comparison' })
    return
  }

  // Validate adapters exist
  const invalidModels = targetModelIds.filter(id => !createAdapter(id))
  if (invalidModels.length > 0) {
    res.status(400).json({
      error: `未配置以下模型的 API Key: ${invalidModels.join(', ')}`,
    })
    return
  }

  // Get or create compare group ID for this run
  const compareGroupId = `compare-${Date.now()}`

  // Save user message(s) to session
  try {
    const userMsgs = messages.filter(m => m.role === 'user')
    for (const msg of userMsgs) {
      await prisma.conversationMessage.create({
        data: {
          sessionId,
          role: 'user',
          content: msg.content,
          metadata: JSON.stringify({ compareGroupId }),
        } as any,
      })
    }
  } catch {}

  // Setup SSE
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  const flush = () => res.write('')

  // Notify all models starting
  res.write(sseData('system', {
    compareGroupId,
    type: 'compare_start',
    modelIds: targetModelIds,
    modelNames: targetModelIds.map(id => getModelName(id)),
  }))
  flush()

  // Run all models in parallel
  const modelRuns = targetModelIds.map(modelId => {
    const adapter = createAdapter(modelId)!
    const apiModel = getApiModelName(modelId)
    const streamId = `compare-${modelId}-${Date.now()}`

    return (async () => {
      // Model start event
      res.write(sse(streamId, 'model_start', {
        compareGroupId,
        model_id: modelId,
        model_name: getModelName(modelId),
      }))
      flush()

      try {
        for await (const chunk of adapter.chatStream!({
          model: apiModel,
          messages,
          temperature: 0.7,
          maxTokens: 4096,
        })) {
          res.write(sseData(streamId, {
            compareGroupId,
            model_id: modelId,
            content: chunk.content,
            done: chunk.done,
            usage: chunk.usage,
          }))
          flush()

          if (chunk.done) {
            // Save assistant message to DB
            try {
              await prisma.conversationMessage.create({
                data: {
                  sessionId,
                  role: 'assistant',
                  content: chunk.content,
                  modelId,
                  provider: adapter.provider,
                  metadata: JSON.stringify({
                    compareGroupId,
                    usage: chunk.usage,
                  }),
                } as any,
              })
            } catch {}
          }
        }
      } catch (err: any) {
        res.write(sseData(streamId, {
          compareGroupId,
          model_id: modelId,
          error: err?.message || 'Unknown error',
          done: true,
        }))
        flush()
      }

      // Model done
      res.write(sse(streamId, 'model_done', { compareGroupId, model_id: modelId }))
      flush()
    })()
  })

  await Promise.allSettled(modelRuns)

  // Compare run complete
  res.write(sseData('system', {
    compareGroupId,
    type: 'compare_done',
    modelIds: targetModelIds,
  }))
  flush()

  res.end()
})

/**
 * POST /api/v1/compare/:sessionId/select
 * 用户选择最佳答案
 *
 * Body: { compareGroupId, modelId, messageId }
 */
router.post('/:sessionId/select', async (req: AuthRequest, res) => {
  try {
    const { compareGroupId, modelId, messageId } = req.body as {
      compareGroupId: string
      modelId: string
      messageId: string
    }

    if (!compareGroupId || !modelId) {
      res.status(400).json({ error: 'compareGroupId and modelId are required' })
      return
    }

    // Mark the chosen message
    await prisma.conversationMessage.updateMany({
      where: {
        sessionId: req.params.sessionId,
        modelId,
        compareGroupId,
      } as any,
      data: {
        isChosen: true,
      },
    })

    res.json({ success: true, modelId, messageId, compareGroupId })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * GET /api/v1/compare/sessions
 * 列出对比会话列表
 */
router.get('/sessions', async (req: AuthRequest, res) => {
  try {
    const { projectId, page = '1', pageSize = '20' } = req.query
    const where: any = {
      userId: req.userId,
      skillName: 'compare',
    }
    if (projectId) where.projectId = projectId

    const pageNum = Math.max(1, parseInt(page as string))
    const size = Math.min(100, Math.max(1, parseInt(pageSize as string)))

    const [sessions, total] = await Promise.all([
      prisma.conversationSession.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (pageNum - 1) * size,
        take: size,
      }),
      prisma.conversationSession.count({ where }),
    ])

    const parsed = sessions.map((s: any) => ({
      ...s,
      modelIds: s.modelIds ? JSON.parse(s.modelIds) : [],
    }))

    res.json({ sessions: parsed, total, page: pageNum, pageSize: size })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * GET /api/v1/compare/sessions/:id
 * 获取单个对比会话详情（含消息）
 */
router.get('/sessions/:id', async (req: AuthRequest, res) => {
  try {
    const session = await prisma.conversationSession.findFirst({
      where: { id: req.params.id, userId: req.userId, skillName: 'compare' },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    })

    if (!session) {
      res.status(404).json({ error: 'Compare session not found' })
      return
    }

    res.json({
      session: {
        ...session,
        modelIds: session.modelIds ? JSON.parse(session.modelIds) : [],
      },
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

export default router
