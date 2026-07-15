/**
 * Discussion Runtime — Type Definitions
 * Phase 3: Multi-Agent Discussion Module
 */

import type { LLMMessage } from '../llm-gateway/types'

// ── Discussion Mode ─────────────────────────────────────────────────────────────

export type DiscussionMode = 'parallel' | 'round-robin' | 'debate' | 'DEBATE_V2' | 'MODERATED'

// ── Discussion Status ──────────────────────────────────────────────────────────

export type DiscussionStatus =
  | 'PENDING'    // Created, not started
  | 'RUNNING'    // Actively running
  | 'PAUSED'     // Manually paused
  | 'COMPLETED'  // Finished normally
  | 'CANCELLED'  // Stopped by user

// ── Debate Rebuttal Stage ───────────────────────────────────────────────────────

export type DebateStage =
  | 'opening'     // Opening statement
  | 'rebuttal'    // Rebuttal round
  | 'counter'     // Counter-rebuttal
  | 'closing'     // Closing statement
  | 'adjudication' // Judge deliberation

// ── Participant Role in Debate ──────────────────────────────────────────────────

export type DebateStance = 'pro' | 'con' | 'neutral'

// ── Voting Types ────────────────────────────────────────────────────────────────

export type VoteType = 'approve' | 'reject' | 'abstain'

export type VoteResult = 'pro_wins' | 'con_wins' | 'tie' | 'no_decision'

export interface VoteConfig {
  enabled: boolean
  voteType: 'approve-reject' | 'rating' | 'ranked'
  isAnonymous: boolean
  ratingMax?: number // For rating type, default 5
}

export interface DiscussionVote {
  voteId: string
  discussionId: string
  participantId: string
  participantName: string
  vote: VoteType | number // number for rating
  score?: number
  isAnonymous: boolean
  createdAt: Date
}

export interface VoteResultSummary {
  totalVotes: number
  approve: number
  reject: number
  abstain: number
  averageScore?: number
  winner?: VoteResult
}

export interface RoundScore {
  roundScoreId: string
  discussionId: string
  roundIndex: number
  participantId: string
  dimension: 'logic' | 'evidence' | 'persuasion' | 'innovation'
  score: number
}

// ── Adjudication Types ─────────────────────────────────────────────────────────

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
  generatedAt: Date
}

// ── Core Types ─────────────────────────────────────────────────────────────────

export interface DiscussionConfig {
  mode: DiscussionMode
  maxRounds: number
  topic: string
  moderatorAgentId?: string
  enableSummary: boolean
  enableConsensusDetection: boolean
  enableReflection: boolean
  // Phase 4: Enhanced configs
  debateConfig?: DebateConfig
  consensusConfig?: ConsensusConfig
  reflectionConfig?: ReflectionConfig
  voteConfig?: VoteConfig
}

export interface DebateConfig {
  rounds: number // Number of debate rounds
  hasAdjudicator: boolean
  scoringDimensions: ('logic' | 'evidence' | 'persuasion' | 'innovation')[]
  openingRequired: boolean
  closingRequired: boolean
  rebuttalRounds: number
}

export interface ConsensusConfig {
  enabled: boolean
  threshold: number // 0.0 - 1.0, similarity threshold for consensus
  autoEndOnConsensus: boolean
  detectionMethod: 'keyword' | 'embedding' | 'llm'
}

export interface ReflectionConfig {
  enabled: boolean
  triggerAfterRounds: number // Trigger reflection after N rounds
  maxReflectionCount: number // Maximum number of reflection cycles
  reflectionPrompt: string
}

export interface ParticipantConfig {
  /** Override the default model for this participant */
  modelId?: string
  /** Override temperature */
  temperature?: number
  /** Extra system prompt additions */
  extraPrompt?: string
  /** For debate mode: pro / con / neutral */
  stance?: DebateStance
  /** For moderator: extra responsibilities */
  isModerator?: boolean
}

export interface DiscussionParticipant {
  id: string
  discussionId: string
  agentId: string
  agentName: string
  agentColor: string
  agentSystemPrompt: string
  position: number
  stance?: DebateStance
  responsibility?: string
  speakOrder: number
  isModerator: boolean
  config: ParticipantConfig
  createdAt: Date
}

// ── Moderator Types ────────────────────────────────────────────────────────────

export interface ModeratorAction {
  actionId: string
  discussionId: string
  actionType: 'introduce' | 'question' | 'summarize' | 'transition' | 'challenge' | 'redirect'
  targetParticipantId?: string
  content: string
  roundIndex: number
  turnIndex: number
  createdAt: Date
}

export interface ModeratorConfig {
  introductionEnabled: boolean
  questionEnabled: boolean
  transitionEnabled: boolean
  challengeEnabled: boolean
  summarizeInterval: number // Summarize every N rounds
  auto引导: boolean // Auto-guide discussion flow
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
  inputTokens?: number
  outputTokens?: number
  createdAt: Date
}

export interface DiscussionSession {
  id: string
  projectId: string
  conversationId: string
  topic: string
  mode: DiscussionMode
  moderatorAgentId?: string
  maxRounds: number
  currentRound: number
  status: DiscussionStatus
  finalSummary?: string
  finalDecision?: string
  participants: DiscussionParticipant[]
  createdById: string
  createdAt: Date
  updatedAt: Date
}

// ── Runtime State ───────────────────────────────────────────────────────────────

export interface DiscussionState {
  session: DiscussionSession
  config: DiscussionConfig
  messages: DiscussionMessage[]
  currentRound: number
  currentTurn: number
  isRunning: boolean
  isPaused: boolean
}

// ── SSE Event Types ────────────────────────────────────────────────────────────

export type DiscussionEventType =
  | 'discussion_start'
  | 'round_start'
  | 'turn_start'
  | 'message_start'
  | 'message_delta'
  | 'message_done'
  | 'turn_done'
  | 'round_done'
  | 'consensus_detected'
  | 'discussion_done'
  | 'discussion_paused'
  | 'discussion_error'
  | 'status_update'
  // Phase 4: New event types
  | 'MODERATOR_MESSAGE'
  | 'REFLECTION_START'
  | 'REFLECTION_COMPLETE'
  | 'CONSENSUS_REACHED'
  | 'CONSENSUS_PROGRESS'
  | 'VOTE_STARTED'
  | 'VOTE_SUBMITTED'
  | 'VOTE_RESULTS'
  | 'DEBATE_ROUND_END'
  | 'ADJUDICATION_COMPLETE'
  | 'DEBATE_STAGE_CHANGE'
  | 'REFLECTION_SUBMITTED'

export interface DiscussionSSEEvent {
  type: DiscussionEventType
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
  status?: DiscussionStatus
  timestamp: number
  // Phase 4: Extended fields
  debateStage?: DebateStage
  moderatorAction?: ModeratorAction
  consensusProgress?: number // 0.0 - 1.0
  reflectionContent?: Record<string, string> // participantId -> reflection
  voteResults?: VoteResultSummary
  adjudicationReport?: AdjudicationReport
  scores?: RoundScore[]
}

// ── LLM Request Context ─────────────────────────────────────────────────────────

export interface ParticipantLLMContext {
  participant: DiscussionParticipant
  topic: string
  mode: DiscussionMode
  roundIndex: number
  turnIndex: number
  /** All previous messages in this discussion */
  previousMessages: DiscussionMessage[]
  /** Other participants' perspectives for this turn */
  otherParticipants: DiscussionParticipant[]
  systemPrompt: string
}

// ── Summarizer Output ──────────────────────────────────────────────────────────

export interface DiscussionSummary {
  discussionId: string
  topic: string
  mode: DiscussionMode
  totalRounds: number
  totalMessages: number
  keyPoints: string[]        // Main points raised
  agreements: string[]        // Points of consensus
  disagreements: string[]    // Points of contention
  finalDecision?: string     // Final conclusion (if reached)
  participantContributions: Record<string, string> // AgentId → contribution summary
  generatedAt: Date
}
