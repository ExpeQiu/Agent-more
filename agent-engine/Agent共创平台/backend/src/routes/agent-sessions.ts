/**
 * Agent Session API 路由
 * Phase 2 对应合并方案 §10.3 AgentSessions
 *
 * 路由前缀：/api/v1/agent-sessions
 */

import { Router } from 'express'
import { randomUUID } from 'crypto'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import prisma from '../config/database'

const router = Router()
router.use(authMiddleware)

// ── Routes ──────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/agent-sessions
 * 创建 Agent 会话
 *
 * Request body:
 * - agentId: string
 * - projectId: string
 * - modelId?: string
 * - title?: string
 */
router.post('/', async (req: AuthRequest, res) => {
  try {
    const { agentId, projectId, modelId, title } = req.body

    if (!agentId || !projectId) {
      res.status(400).json({ error: 'agentId and projectId are required' })
      return
    }

    // 加载 Agent 定义
    const agent = await prisma.agentDefinition.findUnique({ where: { id: agentId } })
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return }

    const session = await prisma.conversationSession.create({
      data: {
        id: randomUUID(),
        projectId,
        userId: req.userId,
        title: title ?? `与 ${agent.name} 的对话`,
        moduleType: 'AGENT',
        sessionMode: 'manual-agent',
        isActive: true,
        skillName: agent.name,
        variables: '{}',
        config: '{}',
        selectedModels: JSON.stringify(modelId ? [modelId] : agent.defaultModel ? [agent.defaultModel] : []),
        discussionConfig: '{}',
      },
    })

    res.status(201).json(session)
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Failed to create session' })
  }
})

/**
 * GET /api/v1/agent-sessions/:id
 * 获取 Agent 会话详情
 */
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const session = await prisma.conversationSession.findUnique({
      where: { id: req.params.id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 100,
        },
      },
    })

    if (!session) { res.status(404).json({ error: 'Session not found' }); return }
    res.json(session)
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Failed to get session' })
  }
})

/**
 * GET /api/v1/agent-sessions?projectId=xxx
 * 列出项目的所有 Agent 会话
 * query: projectId, agentId?, page, pageSize
 */
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { projectId, agentId, page = '1', pageSize = '20' } = req.query

    if (!projectId) {
      res.status(400).json({ error: 'projectId is required' })
      return
    }

    const where: any = {
      projectId: projectId as string,
      moduleType: 'AGENT',
    }
    if (agentId) where.skillName = agentId

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

    res.json({
      sessions,
      pagination: { page: pageNum, pageSize: size, total },
    })
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Failed to list sessions' })
  }
})

/**
 * DELETE /api/v1/agent-sessions/:id
 * 删除 Agent 会话
 */
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.conversationSession.findUnique({ where: { id: req.params.id } })
    if (!existing) { res.status(404).json({ error: 'Session not found' }); return }

    await prisma.conversationSession.update({
      where: { id: req.params.id },
      data: { isActive: false },
    })

    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Failed to delete session' })
  }
})

/**
 * GET /api/v1/agent-sessions/:id/messages
 * 获取会话的消息列表
 */
router.get('/:id/messages', async (req: AuthRequest, res) => {
  try {
    const { page = '1', pageSize = '50' } = req.query
    const pageNum = Math.max(1, parseInt(page as string))
    const size = Math.min(200, Math.max(1, parseInt(pageSize as string)))

    const session = await prisma.conversationSession.findUnique({ where: { id: req.params.id } })
    if (!session) { res.status(404).json({ error: 'Session not found' }); return }

    const [messages, total] = await Promise.all([
      prisma.conversationMessage.findMany({
        where: { sessionId: req.params.id },
        orderBy: { createdAt: 'asc' },
        skip: (pageNum - 1) * size,
        take: size,
      }),
      prisma.conversationMessage.count({ where: { sessionId: req.params.id } }),
    ])

    res.json({
      messages,
      pagination: { page: pageNum, pageSize: size, total },
    })
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Failed to get messages' })
  }
})

export default router
