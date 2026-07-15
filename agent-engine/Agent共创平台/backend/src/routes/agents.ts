/**
 * Agent API 路由
 * Phase 2 对应合并方案 §10.3 Agents
 *
 * 路由前缀：/api/v1/agents
 */

import { Router } from 'express'
import { randomUUID } from 'crypto'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import prisma from '../config/database'
import { executeAgentSSE } from '../modules/agent-runtime/agent-executor'
import type { AgentExecutionRequest } from '../modules/agent-runtime/types'

const router = Router()
router.use(authMiddleware)

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseAgentConfig(config: unknown): Record<string, unknown> {
  if (typeof config === 'string') {
    try { return JSON.parse(config) } catch { return {} }
  }
  if (typeof config === 'object' && config !== null) return config as Record<string, unknown>
  return {}
}

// ── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/agents
 * 列出所有 Agent（分页）
 * query: projectId?, isBuiltIn?, page, pageSize
 */
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { projectId, isBuiltIn, page = '1', pageSize = '50', search } = req.query
    const where: any = { isActive: true }

    if (projectId) where.projectId = projectId
    if (isBuiltIn !== undefined) where.isBuiltIn = isBuiltIn === 'true'
    if (search) where.OR = [
      { name: { contains: String(search) } },
      { roleLabel: { contains: String(search) } },
      { description: { contains: String(search) } },
    ]

    const pageNum = Math.max(1, parseInt(page as string))
    const size = Math.min(100, Math.max(1, parseInt(pageSize as string)))

    const [agents, total] = await Promise.all([
      prisma.agentDefinition.findMany({
        where,
        orderBy: [{ isBuiltIn: 'desc' }, { createdAt: 'asc' }],
        skip: (pageNum - 1) * size,
        take: size,
      }),
      prisma.agentDefinition.count({ where }),
    ])

    res.json({
      agents: agents.map(a => ({ ...a, config: parseAgentConfig(a.config) })),
      pagination: { page: pageNum, pageSize: size, total },
    })
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Failed to list agents' })
  }
})

/**
 * POST /api/v1/agents
 * 创建自定义 Agent
 */
router.post('/', async (req: AuthRequest, res) => {
  try {
    const { name, roleLabel, description, systemPrompt, defaultModel, avatar, color, config, projectId } = req.body

    if (!name || !roleLabel || !systemPrompt) {
      res.status(400).json({ error: 'name, roleLabel, systemPrompt are required' })
      return
    }

    const agent = await prisma.agentDefinition.create({
      data: {
        id: randomUUID(),
        name,
        roleLabel,
        description: description ?? null,
        systemPrompt,
        defaultModel: defaultModel ?? null,
        avatar: avatar ?? null,
        color: color ?? '#6366f1',
        isBuiltIn: false,
        isActive: true,
        config: typeof config === 'string' ? config : JSON.stringify(config ?? {}),
        projectId: projectId ?? null,
        createdById: req.userId,
      },
    })

    res.status(201).json({ ...agent, config: parseAgentConfig(agent.config) })
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Failed to create agent' })
  }
})

/**
 * GET /api/v1/agents/:id
 * 获取 Agent 详情
 */
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const agent = await prisma.agentDefinition.findUnique({ where: { id: req.params.id } })
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return }
    res.json({ ...agent, config: parseAgentConfig(agent.config) })
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Failed to get agent' })
  }
})

/**
 * PUT /api/v1/agents/:id
 * 更新 Agent
 */
router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.agentDefinition.findUnique({ where: { id: req.params.id } })
    if (!existing) { res.status(404).json({ error: 'Agent not found' }); return }
    // 内置 Agent 不可修改
    if (existing.isBuiltIn) { res.status(403).json({ error: 'Built-in agents cannot be modified' }); return }

    const { name, roleLabel, description, systemPrompt, defaultModel, avatar, color, config, isActive } = req.body

    const agent = await prisma.agentDefinition.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(roleLabel !== undefined && { roleLabel }),
        ...(description !== undefined && { description }),
        ...(systemPrompt !== undefined && { systemPrompt }),
        ...(defaultModel !== undefined && { defaultModel }),
        ...(avatar !== undefined && { avatar }),
        ...(color !== undefined && { color }),
        ...(config !== undefined && { config: typeof config === 'string' ? config : JSON.stringify(config) }),
        ...(isActive !== undefined && { isActive }),
      },
    })

    res.json({ ...agent, config: parseAgentConfig(agent.config) })
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Failed to update agent' })
  }
})

/**
 * DELETE /api/v1/agents/:id
 * 删除自定义 Agent
 */
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.agentDefinition.findUnique({ where: { id: req.params.id } })
    if (!existing) { res.status(404).json({ error: 'Agent not found' }); return }
    if (existing.isBuiltIn) { res.status(403).json({ error: 'Built-in agents cannot be deleted' }); return }

    await prisma.agentDefinition.update({
      where: { id: req.params.id },
      data: { isActive: false },
    })

    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Failed to delete agent' })
  }
})

// ── Execution ─────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/agents/execute
 * 手动执行 Agent（核心 API）
 *
 * Request body:
 * - agentId: string
 * - conversationId?: string (关联的会话)
 * - projectId?: string
 * - userMessage: string
 * - modelId?: string
 * - wikiContext?: string
 * - variables?: Record<string, string>
 * - tools?: ToolDefinition[]
 */
router.post('/execute', async (req: AuthRequest, res) => {
  try {
    const {
      agentId,
      conversationId,
      projectId,
      userMessage,
      modelId,
      wikiContext,
      variables,
      tools,
    } = req.body as AgentExecutionRequest

    if (!agentId || !userMessage) {
      res.status(400).json({ error: 'agentId and userMessage are required' })
      return
    }

    // 加载 AgentDefinition
    const agent = await prisma.agentDefinition.findUnique({ where: { id: agentId } })
    if (!agent || !agent.isActive) {
      res.status(404).json({ error: 'Agent not found or inactive' })
      return
    }

    // 创建或复用 conversation session
    let sessionId = conversationId
    if (!sessionId) {
      const session = await prisma.conversationSession.create({
        data: {
          id: randomUUID(),
          projectId: projectId ?? 'default',
          userId: req.userId,
          title: `[${agent.name}] ${userMessage.slice(0, 30)}…`,
          moduleType: 'AGENT',
          sessionMode: 'manual-agent',
          isActive: true,
          // 默认空字段
          skillName: agent.name,
          variables: JSON.stringify(variables ?? {}),
          config: '{}',
          selectedModels: JSON.stringify(modelId ? [modelId] : []),
          discussionConfig: '{}',
        },
      })
      sessionId = session.id
    }

    // 保存用户消息
    await prisma.conversationMessage.create({
      data: {
        id: randomUUID(),
        sessionId,
        role: 'user',
        content: userMessage,
        messageType: 'user',
        status: 'completed',
      },
    })

    // 执行 Agent（SSE 流式）
    const request: AgentExecutionRequest = {
      agentId,
      conversationId: sessionId,
      projectId,
      userMessage,
      modelId,
      wikiContext,
      variables,
      tools,
    }

    // 执行并流式推送
    await executeAgentSSE(
      { ...agent, config: parseAgentConfig(agent.config) } as any,
      request,
      res
    )
  } catch (err: any) {
    console.error('[Agent Execute]', err)
    if (!res.headersSent) {
      res.status(500).json({ error: err?.message ?? 'Agent execution failed' })
    }
  }
})

/**
 * GET /api/v1/agents/executions/:id
 * 获取执行记录详情（从 SkillExecution 表）
 */
router.get('/executions/:id', async (req: AuthRequest, res) => {
  try {
    // 查找 traceId 对应的执行记录
    const execution = await (prisma as any).skillExecution?.findFirst?.({
      where: { traceId: req.params.id },
    }).catch(() => null)

    if (!execution) {
      // 如果没有 SkillExecution 表，直接返回 404
      res.status(404).json({ error: 'Execution not found', id: req.params.id })
      return
    }

    res.json(execution)
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Failed to get execution' })
  }
})

/**
 * GET /api/v1/agents/executions?agentId=xxx&conversationId=xxx
 * 列出某 Agent 的执行历史
 */
router.get('/executions', async (req: AuthRequest, res) => {
  try {
    const { agentId, conversationId, page = '1', pageSize = '20' } = req.query
    const where: any = {}
    if (agentId) where.agentId = agentId
    if (conversationId) where.conversationId = conversationId

    const pageNum = Math.max(1, parseInt(page as string))
    const size = Math.min(100, Math.max(1, parseInt(pageSize as string)))

    // 查询 ConversationMessage（属于 Agent 模块类型的）
    const [messages, total] = await Promise.all([
      prisma.conversationMessage.findMany({
        where: {
          ...(agentId ? { agentId: agentId as string } : {}),
          ...(conversationId ? { sessionId: conversationId as string } : {}),
        },
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * size,
        take: size,
      }),
      prisma.conversationMessage.count({
        where: {
          ...(agentId ? { agentId: agentId as string } : {}),
          ...(conversationId ? { sessionId: conversationId as string } : {}),
        },
      }),
    ])

    res.json({
      executions: messages,
      pagination: { page: pageNum, pageSize: size, total },
    })
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Failed to list executions' })
  }
})

export default router
