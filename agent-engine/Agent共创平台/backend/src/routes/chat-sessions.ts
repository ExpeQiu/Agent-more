/**
 * 多模型聊天会话管理 API
 * 对应 Cocreator conversations，兼容多模型聊天会话字段
 */

import { Router } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import prisma from '../config/database'

const router = Router()
router.use(authMiddleware)

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatSessionMeta {
  id: string
  projectId: string
  userId: string
  title: string
  type: 'single' | 'compare' | 'agent-discuss'
  modelIds: string[]
  createdAt: Date
  updatedAt: Date
}

interface ChatMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  modelId?: string   // assistant 消息所属的模型
  usage?: { inputTokens: number; outputTokens: number }
  createdAt: Date
}

type ChatType = 'single' | 'compare' | 'agent-discuss'

function safeParseJson<T>(raw?: string | null, fallback?: T): T | undefined {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function normalizeChatSession(session: any) {
  const variables = safeParseJson<Record<string, any>>(session.variables, {}) || {}
  const modelIds = safeParseJson<string[]>(session.modelIds, undefined)
    ?? (Array.isArray(variables.modelIds) ? variables.modelIds : [])
  const chatType = ((session.type && session.type !== 'multi-chat'
    ? session.type
    : variables.chatType) || 'single') as ChatType

  return {
    ...session,
    type: chatType,
    chatType,
    modelIds,
  }
}

// ── Routes ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/chat/sessions
 * 列出当前用户的聊天会话
 */
router.get('/sessions', async (req: AuthRequest, res: any) => {
  try {
    const { projectId, type, page = '1', pageSize = '20' } = req.query
    const where: any = { userId: req.userId }
    if (projectId) where.projectId = projectId

    const pageNum = Math.max(1, parseInt(page as string))
    const size = Math.min(100, Math.max(1, parseInt(pageSize as string)))

    const sessions = await prisma.conversationSession.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    })

    const normalized = sessions.map(normalizeChatSession)
    const filtered = type
      ? normalized.filter((s: any) => s.type === type)
      : normalized
    const total = filtered.length
    const paged = filtered.slice((pageNum - 1) * size, pageNum * size)

    res.json({ sessions: paged, total, page: pageNum, pageSize: size })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * GET /api/v1/chat/sessions/:id
 * 获取单个会话详情（含消息）
 */
router.get('/sessions/:id', async (req: AuthRequest, res: any) => {
  try {
    const session = await prisma.conversationSession.findFirst({
      where: { id: req.params.id, userId: req.userId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    })

    if (!session) {
      res.status(404).json({ error: 'Session not found' })
      return
    }

    res.json({ session: normalizeChatSession(session) })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * POST /api/v1/chat/sessions
 * 创建新聊天会话
 */
router.post('/sessions', async (req: AuthRequest, res: any) => {
  try {
    const { projectId, title, type = 'single', modelIds = ['gpt-4o'] } = req.body

    // projectId is now optional — allow standalone sessions

    const resolvedType = type as ChatType
    const resolvedModelIds = Array.isArray(modelIds) ? modelIds : ['gpt-4o']

    const session = await prisma.conversationSession.create({
      data: {
        projectId,
        userId: req.userId!,
        skillName: 'multi-chat',
        title: title || '新对话',
        type: resolvedType,
        modelIds: JSON.stringify(resolvedModelIds),
        variables: JSON.stringify({ modelIds: resolvedModelIds, chatType: resolvedType }),
      } as any,
    })

    res.status(201).json({
      session: normalizeChatSession(session),
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * PATCH /api/v1/chat/sessions/:id
 * 更新会话（如修改标题、模型）
 */
router.patch('/sessions/:id', async (req: AuthRequest, res: any) => {
  try {
    const existing = await prisma.conversationSession.findFirst({
      where: { id: req.params.id, userId: req.userId },
    })

    if (!existing) {
      res.status(404).json({ error: 'Session not found' })
      return
    }

    const { title, modelIds, chatType, type } = req.body
    const existingNormalized = normalizeChatSession(existing)
    const nextType = (chatType ?? type ?? existingNormalized.type) as ChatType
    const nextModelIds = Array.isArray(modelIds) ? modelIds : existingNormalized.modelIds
    const variables = safeParseJson<Record<string, any>>(existing.variables, {}) || {}

    variables.modelIds = nextModelIds
    variables.chatType = nextType

    const updated = await prisma.conversationSession.update({
      where: { id: req.params.id },
      data: {
        title: title !== undefined ? title : existing.title,
        type: nextType,
        modelIds: JSON.stringify(nextModelIds),
        variables: JSON.stringify(variables),
      } as any,
    })

    res.json({
      session: normalizeChatSession(updated),
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * DELETE /api/v1/chat/sessions/:id
 * 删除会话
 */
router.delete('/sessions/:id', async (req: AuthRequest, res: any) => {
  try {
    const existing = await prisma.conversationSession.findFirst({
      where: { id: req.params.id, userId: req.userId },
    })

    if (!existing) {
      res.status(404).json({ error: 'Session not found' })
      return
    }

    // 删除关联消息
    await prisma.conversationMessage.deleteMany({
      where: { sessionId: req.params.id },
    })
    await prisma.conversationSession.delete({
      where: { id: req.params.id },
    })

    res.json({ success: true })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * POST /api/v1/chat/sessions/:id/messages
 * 添加消息到会话
 */
router.post('/sessions/:id/messages', async (req: AuthRequest, res: any) => {
  try {
    const { role, content, modelId } = req.body

    if (!role || !content) {
      res.status(400).json({ error: 'role and content are required' })
      return
    }

    const message = await prisma.conversationMessage.create({
      data: {
        sessionId: req.params.id,
        role,
        content,
        modelId,
        metadata: modelId ? JSON.stringify({ modelId }) : undefined,
      } as any,
    })

    // 更新会话的 updatedAt
    await prisma.conversationSession.update({
      where: { id: req.params.id },
      data: { updatedAt: new Date() } as any,
    })

    res.status(201).json({ message })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

export default router
