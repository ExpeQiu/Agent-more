/**
 * Voting Module — Discussion Voting System
 *
 * Supports multiple voting types:
 * - approve-reject: Simple yes/no/abstain
 * - rating: 1-5 star rating
 * - ranked: Ranking preferences
 *
 * Handles anonymous and public voting, result aggregation, and visualization data.
 */

import type {
  DiscussionParticipant,
  VoteConfig,
  VoteResultSummary,
  VoteType,
} from './types'

// ── Default Config ─────────────────────────────────────────────────────────────

export const DEFAULT_VOTE_CONFIG: Required<VoteConfig> = {
  enabled: true,
  voteType: 'approve-reject',
  isAnonymous: false,
  ratingMax: 5,
}

// ── Vote Record ────────────────────────────────────────────────────────────────

export interface VoteRecord {
  voteId: string
  discussionId: string
  participantId: string
  participantName: string
  vote: VoteType | number
  score?: number
  isAnonymous: boolean
  createdAt: Date
}

// ── Voting Manager Class ────────────────────────────────────────────────────────

export class VotingManager {
  private config: Required<VoteConfig>
  private votes: Map<string, VoteRecord[]> = new Map() // discussionId -> votes
  private voteOpen: Map<string, boolean> = new Map() // discussionId -> isOpen

  constructor(config: Partial<VoteConfig> = {}) {
    this.config = { ...DEFAULT_VOTE_CONFIG, ...config }
  }

  /**
   * Open voting for a discussion
   */
  openVoting(discussionId: string): void {
    this.voteOpen.set(discussionId, true)
    this.votes.set(discussionId, [])
  }

  /**
   * Close voting for a discussion
   */
  closeVoting(discussionId: string): void {
    this.voteOpen.set(discussionId, false)
  }

  /**
   * Check if voting is open
   */
  isVotingOpen(discussionId: string): boolean {
    return this.voteOpen.get(discussionId) ?? false
  }

  /**
   * Submit a vote
   */
  submitVote(
    discussionId: string,
    participant: DiscussionParticipant,
    vote: VoteType | number
  ): VoteRecord | null {
    if (!this.isVotingOpen(discussionId)) {
      return null
    }

    // Check if participant already voted
    const existingVotes = this.votes.get(discussionId) || []
    if (existingVotes.some(v => v.participantId === participant.id)) {
      return null // Already voted
    }

    const record: VoteRecord = {
      voteId: crypto.randomUUID(),
      discussionId,
      participantId: participant.id,
      participantName: participant.isModerator ? 'Anonymous' : participant.agentName,
      vote,
      score: typeof vote === 'number' ? vote : undefined,
      isAnonymous: this.config.isAnonymous,
      createdAt: new Date(),
    }

    existingVotes.push(record)
    this.votes.set(discussionId, existingVotes)

    return record
  }

  /**
   * Get all votes for a discussion
   */
  getVotes(discussionId: string): VoteRecord[] {
    return this.votes.get(discussionId) || []
  }

  /**
   * Get results for a discussion
   */
  getResults(discussionId: string): VoteResultSummary | null {
    const votes = this.getVotes(discussionId)
    if (votes.length === 0) return null

    if (this.config.voteType === 'rating') {
      return this.calculateRatingResults(votes)
    } else {
      return this.calculateApproveRejectResults(votes)
    }
  }

  /**
   * Calculate approve-reject results
   */
  private calculateApproveRejectResults(votes: VoteRecord[]): VoteResultSummary {
    let approve = 0
    let reject = 0
    let abstain = 0

    for (const vote of votes) {
      switch (vote.vote as VoteType) {
        case 'approve':
          approve++
          break
        case 'reject':
          reject++
          break
        case 'abstain':
          abstain++
          break
      }
    }

    return {
      totalVotes: votes.length,
      approve,
      reject,
      abstain,
    }
  }

  /**
   * Calculate rating results
   */
  private calculateRatingResults(votes: VoteRecord[]): VoteResultSummary {
    const ratings = votes
      .map(v => v.score || 0)
      .filter(s => s > 0)

    const totalScore = ratings.reduce((a, b) => a + b, 0)
    const averageScore = ratings.length > 0 ? totalScore / ratings.length : 0

    // Determine winner based on average
    let winner: 'pro_wins' | 'con_wins' | 'tie' | 'no_decision' = 'no_decision'
    if (ratings.length > 0) {
      if (averageScore >= 3.5) {
        winner = 'pro_wins'
      } else if (averageScore <= 2.5) {
        winner = 'con_wins'
      } else {
        winner = 'tie'
      }
    }

    return {
      totalVotes: votes.length,
      approve: 0,
      reject: 0,
      abstain: 0,
      averageScore,
      winner,
    }
  }

  /**
   * Generate ballot for frontend
   */
  generateBallot(): {
    voteType: string
    options: { value: string; label: string }[]
    maxRating?: number
    isAnonymous: boolean
  } {
    switch (this.config.voteType) {
      case 'rating':
        return {
          voteType: 'rating',
          options: Array.from(
            { length: this.config.ratingMax || 5 },
            (_, i) => ({
              value: String(i + 1),
              label: `${i + 1}星`,
            })
          ),
          maxRating: this.config.ratingMax,
          isAnonymous: this.config.isAnonymous,
        }
      case 'approve-reject':
      default:
        return {
          voteType: 'approve-reject',
          options: [
            { value: 'approve', label: '支持' },
            { value: 'reject', label: '反对' },
            { value: 'abstain', label: '弃权' },
          ],
          isAnonymous: this.config.isAnonymous,
        }
    }
  }

  /**
   * Generate results for visualization
   */
  generateVisualizationData(discussionId: string): {
    type: 'bar' | 'pie' | 'rating'
    data: any
  } | null {
    const results = this.getResults(discussionId)
    if (!results) return null

    if (this.config.voteType === 'rating') {
      return {
        type: 'rating',
        data: {
          average: results.averageScore?.toFixed(2),
          total: results.totalVotes,
          maxRating: this.config.ratingMax,
        },
      }
    }

    return {
      type: 'bar',
      data: {
        approve: results.approve,
        reject: results.reject,
        abstain: results.abstain,
        total: results.totalVotes,
      },
    }
  }

  /**
   * Check if participant has voted
   */
  hasVoted(discussionId: string, participantId: string): boolean {
    const votes = this.votes.get(discussionId) || []
    return votes.some(v => v.participantId === participantId)
  }

  /**
   * Get vote by participant
   */
  getVoteByParticipant(discussionId: string, participantId: string): VoteRecord | null {
    const votes = this.votes.get(discussionId) || []
    return votes.find(v => v.participantId === participantId) || null
  }

  /**
   * Get config
   */
  getConfig(): Required<VoteConfig> {
    return this.config
  }

  /**
   * Update config
   */
  updateConfig(config: Partial<VoteConfig>): void {
    this.config = { ...this.config, ...config }
  }
}

// ── Vote Storage ───────────────────────────────────────────────────────────────

export async function saveVote(
  prisma: any,
  record: VoteRecord
): Promise<void> {
  try {
    await prisma.discussionVote.create({
      data: {
        voteId: record.voteId,
        discussionId: record.discussionId,
        participantId: record.participantId,
        participantName: record.participantName,
        vote: String(record.vote),
        score: record.score ?? null,
        isAnonymous: record.isAnonymous,
      },
    })
  } catch (err) {
    console.error('[VotingManager] Failed to save vote:', err)
  }
}

export async function loadVotes(
  prisma: any,
  discussionId: string
): Promise<VoteRecord[]> {
  try {
    const rows = await prisma.discussionVote.findMany({
      where: { discussionId },
      orderBy: { createdAt: 'asc' },
    })

    return rows.map((row: any) => ({
      voteId: row.voteId,
      discussionId: row.discussionId,
      participantId: row.participantId,
      participantName: row.participantName,
      vote: row.vote,
      score: row.score,
      isAnonymous: row.isAnonymous,
      createdAt: new Date(row.createdAt),
    }))
  } catch (err) {
    console.error('[VotingManager] Failed to load votes:', err)
    return []
  }
}

export async function saveVoteResults(
  prisma: any,
  discussionId: string,
  results: VoteResultSummary
): Promise<void> {
  try {
    await prisma.discussionVoteResult.upsert({
      where: { discussionId },
      update: {
        totalVotes: results.totalVotes,
        approve: results.approve,
        reject: results.reject,
        abstain: results.abstain,
        averageScore: results.averageScore ?? null,
        winner: results.winner ?? null,
        generatedAt: new Date(),
      },
      create: {
        discussionId,
        totalVotes: results.totalVotes,
        approve: results.approve,
        reject: results.reject,
        abstain: results.abstain,
        averageScore: results.averageScore ?? null,
        winner: results.winner ?? null,
      },
    })
  } catch (err) {
    console.error('[VotingManager] Failed to save vote results:', err)
  }
}

// ── In-Memory Vote Registry ─────────────────────────────────────────────────────

// Global registry for active voting sessions
const votingManagers = new Map<string, VotingManager>()

export function getVotingManager(discussionId: string): VotingManager | undefined {
  return votingManagers.get(discussionId)
}

export function createVotingManager(
  discussionId: string,
  config?: VoteConfig
): VotingManager {
  const manager = new VotingManager(config)
  votingManagers.set(discussionId, manager)
  return manager
}

export function removeVotingManager(discussionId: string): void {
  votingManagers.delete(discussionId)
}
