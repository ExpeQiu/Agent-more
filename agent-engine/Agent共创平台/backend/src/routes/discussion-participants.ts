/**
 * Discussion Participants API Routes
 * Phase 3: Multi-Agent Discussion Module
 *
 * Endpoints:
 * POST   /api/v1/discussions/:id/participants          — Add participant
 * GET    /api/v1/discussions/:id/participants           — List participants
 * PUT    /api/v1/discussions/:id/participants/:pid      — Update participant
 * DELETE /api/v1/discussions/:id/participants/:pid     — Remove participant
 */

import { Router } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { loadParticipants } from '../modules/discussion-runtime/participant-manager'
import type { DebateStance, ParticipantConfig } from '../modules/discussion-runtime/types'
import prisma from '../config/database'

const router = Router()
router.use(authMiddleware)

// ── Routes ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/discussions/:id/participants
 * Add a participant to the discussion
 *
 * Body: {
 *   agentId: string
 *   position?: number
 *   stance?: 'pro' | 'con' | 'neutral'   (for debate mode)
 *   responsibility?: string
 *   speakOrder?: number
 *   isModerator?: boolean
 *   config?: ParticipantConfig
 * }
 */
router.post('/:id/participants', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const {
      agentId,
      position,
      stance,
      responsibility,
      speakOrder,
      isModerator,
      config,
    } = req.body as {
      agentId: string
      position?: number
      stance?: DebateStance
      responsibility?: string
      speakOrder?: number
      isModerator?: boolean
      config?: ParticipantConfig
    }

    if (!agentId) {
      res.status(400).json({ error: 'agentId is required' })
      return
    }

    const discussion = await prisma.discussionSession.findUnique({
      where: { id },
      select: { id: true },
    })
    if (!discussion) {
      res.status(404).json({ error: 'Discussion not found' })
      return
    }

    const agent = await prisma.agentDefinition.findUnique({
      where: { id: agentId },
      select: { id: true, name: true, color: true },
    })
    if (!agent) {
      res.status(404).json({ error: `Agent ${agentId} not found` })
      return
    }

    let nextOrder = speakOrder
    if (nextOrder === undefined) {
      const lastParticipant = await prisma.discussionParticipant.findFirst({
        where: { discussionId: id },
        orderBy: { speakOrder: 'desc' },
      })
      nextOrder = (lastParticipant?.speakOrder ?? 0) + 1
    }

    const row = await prisma.discussionParticipant.create({
      data: {
        discussionId: id,
        agentId,
        position: position ?? 0,
        stance: stance ?? null,
        responsibility: responsibility ?? null,
        speakOrder: nextOrder,
        isModerator: isModerator ?? false,
        config: JSON.stringify(config ?? {}),
      },
    })

    const participant = {
      id: row.id,
      discussionId: row.discussionId,
      agentId: row.agentId,
      agentName: agent.name,
      agentColor: agent.color || '#6b7280',
      agentSystemPrompt: '',
      position: row.position,
      stance: row.stance as DebateStance | undefined,
      responsibility: row.responsibility,
      speakOrder: row.speakOrder,
      isModerator: Boolean(row.isModerator),
      config: typeof row.config === 'string' ? JSON.parse(row.config) : (row.config || {}),
      createdAt: new Date(row.createdAt),
    }

    res.status(201).json({ participant })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/v1/discussions/:id/participants
 */
router.get('/:id/participants', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params

    const participants = await loadParticipants(id)
    res.json({ participants })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * PUT /api/v1/discussions/:id/participants/:pid
 */
router.put('/:id/participants/:pid', async (req: AuthRequest, res) => {
  try {
    const { id, pid } = req.params
    const { stance, responsibility, speakOrder, position, isModerator, config } = req.body
    const existing = await prisma.discussionParticipant.findFirst({
      where: { id: pid, discussionId: id },
    })

    if (!existing) {
      res.status(404).json({ error: 'Participant not found' })
      return
    }

    const data: any = {}
    if (stance !== undefined) data.stance = stance
    if (responsibility !== undefined) data.responsibility = responsibility
    if (speakOrder !== undefined) data.speakOrder = speakOrder
    if (position !== undefined) data.position = position
    if (isModerator !== undefined) data.isModerator = isModerator
    if (config !== undefined) data.config = JSON.stringify(config)

    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: 'No fields to update' })
      return
    }

    const updated = await prisma.discussionParticipant.update({
      where: { id: pid },
      data,
    })

    res.json({ participant: updated })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * DELETE /api/v1/discussions/:id/participants/:pid
 */
router.delete('/:id/participants/:pid', async (req: AuthRequest, res) => {
  try {
    const { id, pid } = req.params

    await prisma.discussionParticipant.deleteMany({
      where: { id: pid, discussionId: id },
    })

    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
