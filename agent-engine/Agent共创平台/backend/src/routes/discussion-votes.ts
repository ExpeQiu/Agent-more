/**
 * Discussion Voting API Routes
 * Phase 4: Enhanced Discussion Module
 *
 * Endpoints:
 * POST /api/v1/discussions/:id/vote/start     — Start voting
 * POST /api/v1/discussions/:id/vote          — Submit vote
 * GET  /api/v1/discussions/:id/vote/results   — Get voting results
 * GET  /api/v1/discussions/:id/vote/status    — Check if voting is open
 */

import { Router } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import {
  getVotingManager,
  createVotingManager,
  saveVote,
  saveVoteResults,
} from '../modules/discussion-runtime/voting'
import type { VoteConfig, VoteType } from '../modules/discussion-runtime/types'
import prisma from '../config/database'

const router = Router()
router.use(authMiddleware)

// ── Vote Config Registry (in-memory for active sessions) ──────────────────────

const voteConfigs = new Map<string, VoteConfig>()

// ── Routes ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/discussions/:id/vote/start
 * Start voting for a discussion
 */
router.post('/:id/vote/start', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { voteType, isAnonymous, ratingMax } = req.body as {
      voteType?: 'approve-reject' | 'rating' | 'ranked'
      isAnonymous?: boolean
      ratingMax?: number
    }

    const discussion = await prisma.discussionSession.findUnique({
      where: { id },
      select: { id: true },
    })

    if (!discussion) {
      res.status(404).json({ error: 'Discussion not found' })
      return
    }

    // Get or create voting manager
    let manager = getVotingManager(id)
    if (!manager) {
      const config: VoteConfig = {
        enabled: true,
        voteType: voteType || 'approve-reject',
        isAnonymous: isAnonymous ?? false,
        ratingMax: ratingMax || 5,
      }
      manager = createVotingManager(id, config)
      voteConfigs.set(id, config)
    }

    manager.openVoting(id)

    res.json({
      success: true,
      message: 'Voting opened',
      ballot: manager.generateBallot(),
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * POST /api/v1/discussions/:id/vote
 * Submit a vote
 */
router.post('/:id/vote', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { participantId, vote } = req.body as {
      participantId: string
      vote: VoteType | number
    }

    if (!participantId || vote === undefined) {
      res.status(400).json({ error: 'participantId and vote are required' })
      return
    }

    const manager = getVotingManager(id)
    if (!manager) {
      res.status(400).json({ error: 'Voting has not started for this discussion' })
      return
    }

    if (!manager.isVotingOpen(id)) {
      res.status(400).json({ error: 'Voting is closed' })
      return
    }

    const participantRow = await prisma.discussionParticipant.findFirst({
      where: { id: participantId, discussionId: id },
    })

    if (!participantRow) {
      res.status(404).json({ error: 'Participant not found' })
      return
    }

    const agent = await prisma.agentDefinition.findUnique({
      where: { id: participantRow.agentId },
      select: { name: true, color: true },
    })

    const participant = {
      id: participantRow.id,
      discussionId: participantRow.discussionId,
      agentId: participantRow.agentId,
      agentName: agent?.name || participantRow.agentId,
      agentColor: agent?.color || '#6b7280',
      position: participantRow.position,
      stance: participantRow.stance as any,
      isModerator: participantRow.isModerator,
      agentSystemPrompt: '',
      speakOrder: participantRow.speakOrder,
      config: participantRow.config ? JSON.parse(participantRow.config) : {},
      createdAt: new Date(participantRow.createdAt),
    }

    // Submit vote
    const record = manager.submitVote(id, participant, vote)
    if (!record) {
      res.status(400).json({ error: 'You have already voted or voting is closed' })
      return
    }

    // Persist to DB
    await saveVote(prisma, record)

    res.json({
      success: true,
      vote: record.isAnonymous ? { voteId: record.voteId } : record,
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/v1/discussions/:id/vote/results
 * Get voting results
 */
router.get('/:id/vote/results', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params

    const manager = getVotingManager(id)
    if (!manager) {
      const persisted = await prisma.discussionVoteResult.findUnique({
        where: { discussionId: id },
      })

      if (!persisted) {
        res.json({ results: null, visualization: null, config: voteConfigs.get(id) || null })
        return
      }

      const results = {
        totalVotes: persisted.totalVotes,
        approve: persisted.approve,
        reject: persisted.reject,
        abstain: persisted.abstain,
        averageScore: persisted.averageScore ?? undefined,
        winner: persisted.winner as any,
      }

      res.json({
        results,
        visualization: persisted.averageScore !== null
          ? {
              type: 'rating',
              data: {
                average: persisted.averageScore?.toFixed(2),
                total: persisted.totalVotes,
              },
            }
          : {
              type: 'bar',
              data: {
                approve: persisted.approve,
                reject: persisted.reject,
                abstain: persisted.abstain,
                total: persisted.totalVotes,
              },
            },
        config: voteConfigs.get(id) || null,
      })
      return
    }

    const results = manager.getResults(id)
    if (!results) {
      res.json({ results: null, message: 'No votes have been submitted' })
      return
    }

    const visualization = manager.generateVisualizationData(id)

    res.json({
      results,
      visualization,
      config: manager.getConfig(),
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/v1/discussions/:id/vote/status
 * Check voting status
 */
router.get('/:id/vote/status', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params

    const manager = getVotingManager(id)
    if (!manager) {
      const totalVotes = await prisma.discussionVote.count({
        where: { discussionId: id },
      })
      res.json({
        isOpen: false,
        totalVotes,
        config: voteConfigs.get(id) || null,
      })
      return
    }

    const votes = manager.getVotes(id)

    res.json({
      isOpen: manager.isVotingOpen(id),
      totalVotes: votes.length,
      ballot: manager.generateBallot(),
      config: manager.getConfig(),
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/v1/discussions/:id/vote/my-vote
 * Get current user's vote
 */
router.get('/:id/vote/my-vote', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { participantId } = req.query

    if (!participantId) {
      res.status(400).json({ error: 'participantId query param is required' })
      return
    }

    const manager = getVotingManager(id)
    if (!manager) {
      const savedVote = await prisma.discussionVote.findFirst({
        where: {
          discussionId: id,
          participantId: participantId as string,
        },
      })

      res.json({
        voted: !!savedVote,
        vote: savedVote?.isAnonymous ? { voteId: savedVote.voteId } : savedVote,
      })
      return
    }

    const myVote = manager.getVoteByParticipant(id, participantId as string)

    res.json({
      voted: !!myVote,
      vote: myVote?.isAnonymous ? { voteId: myVote.voteId } : myVote,
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * POST /api/v1/discussions/:id/vote/close
 * Close voting and save results
 */
router.post('/:id/vote/close', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params

    const manager = getVotingManager(id)
    if (!manager) {
      res.status(400).json({ error: 'Voting has not started for this discussion' })
      return
    }

    manager.closeVoting(id)

    // Get final results
    const results = manager.getResults(id)
    if (results) {
      await saveVoteResults(prisma, id, results)
    }

    res.json({
      success: true,
      results,
      visualization: manager.generateVisualizationData(id),
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
