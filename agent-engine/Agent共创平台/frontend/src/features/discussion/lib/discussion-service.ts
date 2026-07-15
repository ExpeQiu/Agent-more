/**
 * Discussion Service — API Client
 * Phase 3: Multi-Agent Discussion Module
 */

import api from '@/lib/api/client'
import { appendTokenToUrl } from '@/lib/runtime-config'

export interface CreateDiscussionPayload {
  projectId: string
  conversationId: string
  topic: string
  mode?: 'parallel' | 'round-robin' | 'debate'
  maxRounds?: number
  participantIds?: string[]
  moderatorAgentId?: string
}

export interface DiscussionSession {
  id: string
  projectId: string
  conversationId: string
  topic: string
  mode: 'parallel' | 'round-robin' | 'debate'
  moderatorAgentId?: string
  maxRounds: number
  currentRound: number
  status: 'PENDING' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED'
  finalSummary?: string
  finalDecision?: string
  participants: DiscussionParticipant[]
  createdById: string
  createdAt: string
  updatedAt: string
}

export interface DiscussionParticipant {
  id: string
  discussionId: string
  agentId: string
  agentName: string
  agentColor: string
  agentSystemPrompt: string
  position: number
  stance?: 'pro' | 'con' | 'neutral'
  responsibility?: string
  speakOrder: number
  isModerator: boolean
  config: Record<string, unknown>
  createdAt: string
}

export interface DiscussionMessage {
  id: string
  discussionId: string
  participantId: string
  agentId: string
  agentName: string
  roundIndex: number
  turnIndex: number
  content: string
  role: 'participant' | 'moderator' | 'system'
  isStreaming: boolean
  latencyMs?: number
  createdAt: string
}

export interface DiscussionStatus {
  status: string
  currentRound: number
  maxRounds: number
  topic: string
  mode: string
  isRunning: boolean
  isPaused: boolean
  updatedAt: string
}

export interface SSEEvent {
  type: string
  discussionId: string
  roundIndex?: number
  turnIndex?: number
  participantId?: string
  agentId?: string
  agentName?: string
  content?: string
  done?: boolean
  error?: string
  summary?: string
  decision?: string
  status?: string
  timestamp: number
  // Phase 4: Extended fields
  debateStage?: string
  moderatorAction?: any
  consensusProgress?: number
  reflectionContent?: Record<string, string>
  voteResults?: VoteResultSummary
  adjudicationReport?: AdjudicationReport
  scores?: RoundScore[]
}

export interface VoteResultSummary {
  totalVotes: number
  approve: number
  reject: number
  abstain: number
  averageScore?: number
  winner?: 'pro_wins' | 'con_wins' | 'tie' | 'no_decision'
}

export interface AdjudicationReport {
  discussionId: string
  winner: 'pro' | 'con' | 'tie'
  proScore: number
  conScore: number
  proStrengths: string[]
  conStrengths: string[]
  proWeaknesses: string[]
  conWeaknesses: string[]
  reasoning: string
  keyDecidingFactors: string[]
  generatedAt: string
}

export interface RoundScore {
  roundScoreId: string
  discussionId: string
  roundIndex: number
  participantId: string
  dimension: 'logic' | 'evidence' | 'persuasion' | 'innovation'
  score: number
}

// ── API Methods ────────────────────────────────────────────────────────────────

export const discussionService = {
  /** List discussions for a project */
  async list(projectId: string, params?: { status?: string; page?: number; pageSize?: number }) {
    const res = await api.get('/discussions', { params: { projectId, ...params } })
    return res.data
  },

  /** Get single discussion */
  async get(discussionId: string) {
    const res = await api.get(`/discussions/${discussionId}`)
    return res.data
  },

  /** Create discussion */
  async create(payload: CreateDiscussionPayload) {
    const res = await api.post('/discussions', payload)
    return res.data
  },

  /** Update discussion */
  async update(discussionId: string, payload: Partial<CreateDiscussionPayload>) {
    const res = await api.put(`/discussions/${discussionId}`, payload)
    return res.data
  },

  /** Delete discussion */
  async delete(discussionId: string) {
    const res = await api.delete(`/discussions/${discussionId}`)
    return res.data
  },

  /** Start discussion — returns SSE EventSource */
  startSSE(discussionId: string): EventSource {
    const token = localStorage.getItem('token') || ''
    const url = appendTokenToUrl(`/api/v1/discussions/${discussionId}/start`, token)
    const es = new EventSource(url, {
      // Note: EventSource doesn't support custom headers natively
      // In production, prefer cookie-based auth or query token fallback
    })
    return es
  },

  /** Stop discussion */
  async stop(discussionId: string) {
    const res = await api.post(`/discussions/${discussionId}/stop`)
    return res.data
  },

  /** Pause discussion */
  async pause(discussionId: string) {
    const res = await api.post(`/discussions/${discussionId}/pause`)
    return res.data
  },

  /** Resume discussion */
  async resume(discussionId: string) {
    const res = await api.post(`/discussions/${discussionId}/resume`)
    return res.data
  },

  /** Get messages */
  async getMessages(discussionId: string, params?: { roundIndex?: number; agentId?: string }) {
    const res = await api.get(`/discussions/${discussionId}/messages`, { params })
    return res.data
  },

  /** Add message manually */
  async addMessage(discussionId: string, payload: {
    agentId?: string
    agentName?: string
    content: string
    role?: string
    roundIndex?: number
    turnIndex?: number
  }) {
    const res = await api.post(`/discussions/${discussionId}/messages`, payload)
    return res.data
  },

  /** Get status */
  async getStatus(discussionId: string): Promise<DiscussionStatus> {
    const res = await api.get(`/discussions/${discussionId}/status`)
    return res.data
  },

  /** Get summary */
  async getSummary(discussionId: string) {
    const res = await api.get(`/discussions/${discussionId}/summary`)
    return res.data
  },

  // ── Participants ──────────────────────────────────────────────────────────

  /** List participants */
  async listParticipants(discussionId: string) {
    const res = await api.get(`/discussions/${discussionId}/participants`)
    return res.data
  },

  /** Add participant */
  async addParticipant(discussionId: string, payload: {
    agentId: string
    position?: number
    stance?: 'pro' | 'con' | 'neutral'
    responsibility?: string
    speakOrder?: number
    isModerator?: boolean
    config?: Record<string, unknown>
  }) {
    const res = await api.post(`/discussions/${discussionId}/participants`, payload)
    return res.data
  },

  /** Update participant */
  async updateParticipant(discussionId: string, participantId: string, payload: {
    stance?: 'pro' | 'con' | 'neutral'
    responsibility?: string
    speakOrder?: number
    position?: number
    isModerator?: boolean
    config?: Record<string, unknown>
  }) {
    const res = await api.put(`/discussions/${discussionId}/participants/${participantId}`, payload)
    return res.data
  },

  /** Remove participant */
  async removeParticipant(discussionId: string, participantId: string) {
    const res = await api.delete(`/discussions/${discussionId}/participants/${participantId}`)
    return res.data
  },

  // ── Phase 4: Voting ──────────────────────────────────────────────────────────

  /** Start voting */
  async startVote(discussionId: string, payload?: {
    voteType?: 'approve-reject' | 'rating' | 'ranked'
    isAnonymous?: boolean
    ratingMax?: number
  }) {
    const res = await api.post(`/discussions/${discussionId}/vote/start`, payload || {})
    return res.data
  },

  /** Submit vote */
  async submitVote(discussionId: string, payload: {
    participantId: string
    vote: 'approve' | 'reject' | 'abstain' | number
  }) {
    const res = await api.post(`/discussions/${discussionId}/vote`, payload)
    return res.data
  },

  /** Get vote results */
  async getVoteResults(discussionId: string) {
    const res = await api.get(`/discussions/${discussionId}/vote/results`)
    return res.data
  },

  /** Get vote status */
  async getVoteStatus(discussionId: string) {
    const res = await api.get(`/discussions/${discussionId}/vote/status`)
    return res.data
  },

  /** Get my vote */
  async getMyVote(discussionId: string, participantId: string) {
    const res = await api.get(`/discussions/${discussionId}/vote/my-vote`, {
      params: { participantId }
    })
    return res.data
  },

  /** Close voting */
  async closeVote(discussionId: string) {
    const res = await api.post(`/discussions/${discussionId}/vote/close`)
    return res.data
  },
}

// ── SSE Event Stream Helper ────────────────────────────────────────────────────

export function createDiscussionEventSource(
  discussionId: string,
  callbacks: {
    onOpen?: () => void
    onEvent?: (event: SSEEvent) => void
    onError?: (error: Event) => void
    onDone?: () => void
  }
): { eventSource: EventSource; cleanup: () => void } {
  const token = localStorage.getItem('token') || ''

  // Append token as query param for auth (EventSource doesn't support headers)
  const url = appendTokenToUrl(`/api/v1/discussions/${discussionId}/start`, token)

  const es = new EventSource(url)

  es.onopen = () => callbacks.onOpen?.()

  // Listen for all custom event types (including Phase 4)
  const eventTypes = [
    'discussion_start',
    'round_start',
    'turn_start',
    'message_start',
    'message_delta',
    'message_done',
    'turn_done',
    'round_done',
    'consensus_detected',
    'consensus_reached',
    'consensus_progress',
    'discussion_done',
    'discussion_paused',
    'discussion_error',
    'status_update',
    // Phase 4 new events
    'MODERATOR_MESSAGE',
    'REFLECTION_START',
    'REFLECTION_COMPLETE',
    'REFLECTION_SUBMITTED',
    'VOTE_STARTED',
    'VOTE_SUBMITTED',
    'VOTE_RESULTS',
    'DEBATE_ROUND_END',
    'DEBATE_STAGE_CHANGE',
    'ADJUDICATION_COMPLETE',
  ]

  for (const type of eventTypes) {
    es.addEventListener(type, (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as SSEEvent
        callbacks.onEvent?.(data)
        if (type === 'discussion_done' || type === 'discussion_error' || type === 'discussion_paused') {
          callbacks.onDone?.()
        }
      } catch {}
    })
  }

  es.onerror = (e) => {
    callbacks.onError?.(e)
    // Don't auto-close on error — let the caller handle it
  }

  const cleanup = () => {
    es.close()
  }

  return { eventSource: es, cleanup }
}
