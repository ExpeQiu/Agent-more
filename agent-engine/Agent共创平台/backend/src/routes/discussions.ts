/**
 * Discussion API Routes
 * Phase 3: Multi-Agent Discussion Module
 *
 * Endpoints:
 * POST /api/v1/discussions                          — Create discussion
 * GET  /api/v1/discussions/:id                       — Get discussion
 * GET  /api/v1/discussions?projectId=xxx            — List project discussions
 * PUT  /api/v1/discussions/:id                       — Update config
 * DELETE /api/v1/discussions/:id                    — Delete
 *
 * POST /api/v1/discussions/:id/start                — Start discussion (SSE)
 * POST /api/v1/discussions/:id/stop                 — Stop
 * POST /api/v1/discussions/:id/pause                — Pause
 *
 * GET  /api/v1/discussions/:id/messages             — Get messages
 * POST /api/v1/discussions/:id/messages             — Manual add message
 *
 * GET  /api/v1/discussions/:id/status               — Get runtime status
 * GET  /api/v1/discussions/:id/summary              — Get summary
 * GET  /api/v1/discussions/:id/events/stream        — SSE event stream
 */

import { randomUUID } from 'crypto'
import { Router } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { DiscussionRuntime, type SSEEmitter } from '../modules/discussion-runtime/discussion-runtime'
import { loadParticipants } from '../modules/discussion-runtime/participant-manager'
import type {
  DiscussionSession,
  DiscussionConfig,
  DiscussionSSEEvent,
  DiscussionMessage,
} from '../modules/discussion-runtime/types'
import prisma from '../config/database'

const router = Router()
router.use(authMiddleware)

// ── In-memory runtime registry ─────────────────────────────────────────────────

const activeRuntimes = new Map<string, DiscussionRuntime>()

// ── SSE Helpers ─────────────────────────────────────────────────────────────────

function makeEmitter(res: any): SSEEmitter {
  return (event: DiscussionSSEEvent) => {
    res.write(`id: ${event.discussionId}-${event.type}-${event.timestamp}\n`)
    res.write(`event: ${event.type}\n`)
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  }
}

function mapDiscussionSession(row: any, participants: any[] = []): DiscussionSession {
  return {
    id: row.id,
    projectId: row.projectId,
    conversationId: row.conversationId,
    topic: row.topic,
    mode: row.mode,
    moderatorAgentId: row.moderatorAgentId ?? undefined,
    maxRounds: row.maxRounds,
    currentRound: row.currentRound,
    status: row.status,
    finalSummary: row.finalSummary ?? undefined,
    finalDecision: row.finalDecision ?? undefined,
    participants,
    createdById: row.createdById,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  }
}

function parseMessageMetadata(raw: unknown) {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch {
      return {}
    }
  }
  return (raw as Record<string, unknown>) || {}
}

// ── Routes ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/discussions
 * Create a new discussion session
 */
router.post('/', async (req: AuthRequest, res) => {
  try {
    const { projectId, conversationId, topic, mode, maxRounds, participantIds, moderatorAgentId } = req.body as {
      projectId?: string
      conversationId: string
      topic: string
      mode?: 'parallel' | 'round-robin' | 'debate'
      maxRounds?: number
      participantIds?: string[]
      moderatorAgentId?: string
    }

    if (!conversationId || !topic) {
      res.status(400).json({ error: 'conversationId and topic are required' })
      return
    }

    const sessionRow = await prisma.discussionSession.create({
      data: {
        id: randomUUID(),
        projectId,
        conversationId,
        topic,
        mode: mode || 'round-robin',
        moderatorAgentId: moderatorAgentId || null,
        maxRounds: maxRounds || 3,
        currentRound: 1,
        status: 'PENDING',
        createdById: req.userId!,
      },
    })

    const session: DiscussionSession = mapDiscussionSession(sessionRow)

    // Add participants if provided
    if (participantIds && participantIds.length > 0) {
      const agents = await prisma.agentDefinition.findMany({
        where: { id: { in: participantIds } },
        select: { id: true },
      })

      const validAgentIds = new Set(agents.map((agent) => agent.id))

      for (const [index, agentId] of participantIds.entries()) {
        if (!validAgentIds.has(agentId)) continue
        await prisma.discussionParticipant.create({
          data: {
            id: randomUUID(),
            discussionId: session.id,
            agentId,
            position: 0,
            speakOrder: index + 1,
            isModerator: agentId === moderatorAgentId,
            config: '{}',
          },
        })
      }
      session.participants = await loadParticipants(session.id)
    }

    res.status(201).json({ discussion: session })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/v1/discussions/:id
 * Get discussion details (with participants)
 */
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params

    const row = await prisma.discussionSession.findUnique({
      where: { id },
    })

    if (!row) {
      res.status(404).json({ error: 'Discussion not found' })
      return
    }

    const participants = await loadParticipants(id)
    const discussion: DiscussionSession = mapDiscussionSession(row, participants)

    res.json({ discussion })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/v1/discussions?projectId=xxx
 * List discussions for a project
 */
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { projectId, status, page = '1', pageSize = '20' } = req.query
    const where: any = {}
    if (projectId) where.projectId = String(projectId)
    if (status) where.status = String(status)

    const pageNum = Math.max(1, parseInt(page as string))
    const size = Math.min(100, Math.max(1, parseInt(pageSize as string)))
    const [rows, total] = await Promise.all([
      prisma.discussionSession.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * size,
        take: size,
      }),
      prisma.discussionSession.count({ where }),
    ])

    res.json({
      discussions: rows,
      total,
      page: pageNum,
      pageSize: size,
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * PUT /api/v1/discussions/:id
 * Update discussion config
 */
router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { topic, mode, maxRounds, moderatorAgentId } = req.body
    const data: any = {}
    if (topic !== undefined) data.topic = topic
    if (mode !== undefined) data.mode = mode
    if (maxRounds !== undefined) data.maxRounds = maxRounds
    if (moderatorAgentId !== undefined) data.moderatorAgentId = moderatorAgentId

    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: 'No fields to update' })
      return
    }

    const updated = await prisma.discussionSession.update({
      where: { id },
      data,
    })

    res.json({ discussion: updated })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * DELETE /api/v1/discussions/:id
 */
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params

    // Stop runtime if running
    const runtime = activeRuntimes.get(id)
    if (runtime) {
      await runtime.stop()
      activeRuntimes.delete(id)
    }

    await prisma.discussionParticipant.deleteMany({ where: { discussionId: id } })
    await prisma.discussionVote.deleteMany({ where: { discussionId: id } })
    await prisma.discussionRoundScore.deleteMany({ where: { discussionId: id } })
    await prisma.discussionAdjudication.deleteMany({ where: { discussionId: id } })
    await prisma.discussionVoteResult.deleteMany({ where: { discussionId: id } })
    await prisma.discussionSession.delete({ where: { id } })

    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * POST /api/v1/discussions/:id/start
 * Start discussion — returns SSE stream
 */
router.post('/:id/start', async (req: AuthRequest, res) => {
  const { id } = req.params

  const row = await prisma.discussionSession.findUnique({
    where: { id },
  })

  if (!row) {
    res.status(404).json({ error: 'Discussion not found' })
    return
  }

  const participants = await loadParticipants(id)

  if (participants.length < 2) {
    res.status(400).json({ error: 'At least 2 participants are required to start a discussion' })
    return
  }

  const session: DiscussionSession = mapDiscussionSession(row, participants)

  const config: DiscussionConfig = {
    mode: session.mode,
    maxRounds: session.maxRounds,
    topic: session.topic,
    moderatorAgentId: session.moderatorAgentId,
    enableSummary: true,
    enableConsensusDetection: false,
    enableReflection: false,
  }

  // Setup SSE
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  const emitter = makeEmitter(res)

  const runtime = new DiscussionRuntime(session, config, emitter)
  activeRuntimes.set(id, runtime)

  // Run discussion
  runtime.start().catch((err: any) => {
    emitter({
      type: 'discussion_error',
      discussionId: id,
      error: err.message,
      timestamp: Date.now(),
    })
  }).finally(() => {
    activeRuntimes.delete(id)
    res.end()
  })
})

/**
 * POST /api/v1/discussions/:id/stop
 */
router.post('/:id/stop', async (req: AuthRequest, res) => {
  try {
    const runtime = activeRuntimes.get(req.params.id)
    if (runtime) {
      await runtime.stop()
      activeRuntimes.delete(req.params.id)
    }
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * POST /api/v1/discussions/:id/pause
 */
router.post('/:id/pause', async (req: AuthRequest, res) => {
  try {
    const runtime = activeRuntimes.get(req.params.id)
    if (runtime) {
      await runtime.pause()
    }
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * POST /api/v1/discussions/:id/resume
 */
router.post('/:id/resume', async (req: AuthRequest, res) => {
  try {
    const runtime = activeRuntimes.get(req.params.id)
    if (runtime) {
      await runtime.resume()
    }
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/v1/discussions/:id/messages
 */
router.get('/:id/messages', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { roundIndex, agentId } = req.query
    const discussion = await prisma.discussionSession.findUnique({
      where: { id },
      select: { conversationId: true },
    })

    if (!discussion) {
      res.status(404).json({ error: 'Discussion not found' })
      return
    }

    const rows = await prisma.conversationMessage.findMany({
      where: {
        sessionId: discussion.conversationId,
        ...(roundIndex ? { roundIndex: parseInt(roundIndex as string) } : {}),
        ...(agentId ? { agentId: String(agentId) } : {}),
      },
      orderBy: { createdAt: 'asc' },
    })

    const messages: DiscussionMessage[] = rows.map((row: any) => {
      const meta = parseMessageMetadata(row.metadata)
      return {
        id: row.id,
        discussionId: String(meta.discussionId || id),
        participantId: String(meta.participantId || row.agentId),
        agentId: row.agentId,
        agentName: String(meta.agentName || row.agentId),
        roundIndex: row.roundIndex,
        turnIndex: row.turnIndex,
        content: row.content,
        role: row.role as any,
        isStreaming: false,
        latencyMs: typeof meta.latencyMs === 'number' ? meta.latencyMs : undefined,
        createdAt: new Date(row.createdAt),
      }
    }).filter((message) => message.discussionId === id)

    res.json({ messages })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * POST /api/v1/discussions/:id/messages
 * Manually add a message (e.g., from a moderator)
 */
router.post('/:id/messages', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { agentId, agentName, content, role = 'moderator', roundIndex = 1, turnIndex = 0 } = req.body

    const discussion = await prisma.discussionSession.findUnique({
      where: { id },
      select: { conversationId: true },
    })

    if (!discussion) {
      res.status(404).json({ error: 'Discussion not found' })
      return
    }

    if (!content) {
      res.status(400).json({ error: 'content is required' })
      return
    }

    const message: DiscussionMessage = {
      id: randomUUID(),
      discussionId: id,
      participantId: 'manual',
      agentId: agentId || 'manual',
      agentName: agentName || '主持人',
      roundIndex,
      turnIndex,
      content,
      role: role as any,
      isStreaming: false,
      createdAt: new Date(),
    }

    await prisma.conversationMessage.create({
      data: {
        id: message.id,
        sessionId: discussion.conversationId,
        role: message.role,
        content: message.content,
        agentId: message.agentId,
        roundIndex: message.roundIndex,
        turnIndex: message.turnIndex,
        metadata: JSON.stringify({
          discussionId: id,
          participantId: message.participantId,
          agentName: message.agentName,
        }),
      } as any,
    })

    res.status(201).json({ message })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/v1/discussions/:id/status
 */
router.get('/:id/status', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params

    const row = await prisma.discussionSession.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        currentRound: true,
        maxRounds: true,
        topic: true,
        mode: true,
        updatedAt: true,
      },
    })

    if (!row) {
      res.status(404).json({ error: 'Discussion not found' })
      return
    }

    const runtime = activeRuntimes.get(id)

    res.json({
      status: row.status,
      currentRound: row.currentRound,
      maxRounds: row.maxRounds,
      topic: row.topic,
      mode: row.mode,
      isRunning: runtime?.isRunning() ?? false,
      isPaused: runtime?.isPaused() ?? false,
      updatedAt: row.updatedAt,
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/v1/discussions/:id/summary
 */
router.get('/:id/summary', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params

    const row = await prisma.discussionSession.findUnique({
      where: { id },
      select: {
        finalSummary: true,
        finalDecision: true,
        status: true,
        mode: true,
        topic: true,
        currentRound: true,
        maxRounds: true,
      },
    })

    if (!row) {
      res.status(404).json({ error: 'Discussion not found' })
      return
    }

    res.json({
      summary: row.finalSummary ? JSON.parse(row.finalSummary) : null,
      decision: row.finalDecision,
      status: row.status,
      mode: row.mode,
      topic: row.topic,
      rounds: {
        current: row.currentRound,
        max: row.maxRounds,
      },
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
