/**
 * Consensus Detector — Real-time Agreement Detection
 *
 * Detects when participants reach consensus or significant agreement.
 *
 * Methods:
 * - keyword: Simple keyword matching
 * - embedding: Vector similarity (requires embedding API)
 * - llm: LLM-based semantic analysis
 */

import type {
  DiscussionMessage,
  DiscussionParticipant,
  ConsensusConfig,
} from './types'

// ── Default Config ─────────────────────────────────────────────────────────────

export const DEFAULT_CONSENSUS_CONFIG: Required<ConsensusConfig> = {
  enabled: true,
  threshold: 0.8,
  autoEndOnConsensus: false,
  detectionMethod: 'keyword',
}

// ── Consensus Result ────────────────────────────────────────────────────────────

export interface ConsensusResult {
  reached: boolean
  progress: number // 0.0 - 1.0
  agreementLevel: number // 0.0 - 1.0
  consensusType?: 'full' | 'partial' | 'tentative'
  summary?: string
  agreeingParticipants: string[] // participant IDs
  keyAgreements: string[]
  detectedAt: Date
}

// ── Consensus Detector Class ─────────────────────────────────────────────────────

export class ConsensusDetector {
  private config: Required<ConsensusConfig>
  private recentChecks: ConsensusResult[] = []

  constructor(config: Partial<ConsensusConfig> = {}) {
    this.config = { ...DEFAULT_CONSENSUS_CONFIG, ...config }
  }

  /**
   * Detect consensus among all participants
   */
  async detect(
    messages: DiscussionMessage[],
    participants: DiscussionParticipant[]
  ): Promise<ConsensusResult> {
    if (!this.config.enabled || messages.length < 2) {
      return {
        reached: false,
        progress: 0,
        agreementLevel: 0,
        agreeingParticipants: [],
        keyAgreements: [],
        detectedAt: new Date(),
      }
    }

    // Get recent messages from each participant
    const recentMessages = this.getRecentMessagesPerParticipant(messages, 3)

    let result: ConsensusResult

    switch (this.config.detectionMethod) {
      case 'embedding':
        result = await this.detectWithEmbedding(recentMessages, participants)
        break
      case 'llm':
        result = await this.detectWithLLM(recentMessages, participants)
        break
      case 'keyword':
      default:
        result = this.detectWithKeywords(recentMessages, participants)
    }

    this.recentChecks.push(result)
    return result
  }

  /**
   * Detect consensus with keyword matching (lightweight)
   */
  private detectWithKeywords(
    recentMessages: Map<string, DiscussionMessage[]>,
    participants: DiscussionParticipant[]
  ): ConsensusResult {
    const participantIds = Array.from(recentMessages.keys())
    const texts = participantIds.map(id =>
      recentMessages.get(id)!.map(m => m.content.toLowerCase()).join(' ')
    )

    // Consensus keywords
    const consensusKeywords = [
      '同意', '支持', '认可', '共识', '赞成', '的确', '没错', '确实如此',
      'agree', 'support', 'consensus', 'yes', 'indeed', 'correct',
    ]

    // Disagreement keywords
    const disagreementKeywords = [
      '反对', '不同意', '质疑', '但是', '然而', '虽然', '不对', '不是',
      'oppose', 'disagree', 'objection', 'however', 'although', 'no',
    ]

    const consensusCounts = texts.map(text =>
      consensusKeywords.filter(k => text.includes(k)).length
    )

    const disagreementCounts = texts.map(text =>
      disagreementKeywords.filter(k => text.includes(k)).length
    )

    // Calculate agreement level
    const avgConsensus = consensusCounts.reduce((a, b) => a + b, 0) / consensusCounts.length
    const avgDisagreement = disagreementCounts.reduce((a, b) => 0, 0) / disagreementCounts.length

    const agreementLevel = Math.min(avgConsensus / 2, 1) - Math.min(avgDisagreement / 3, 0.5)
    const normalizedAgreement = Math.max(0, Math.min(1, agreementLevel))

    // Determine agreeing participants
    const agreeingParticipants = participantIds.filter((_, i) =>
      consensusCounts[i] > disagreementCounts[i]
    )

    // Extract key agreements
    const keyAgreements: string[] = []
    for (const keyword of consensusKeywords) {
      const found = texts.filter(t => t.includes(keyword))
      if (found.length >= participantIds.length * 0.6) {
        keyAgreements.push(`"${keyword}" appears in ${found.length} participants' messages`)
      }
    }

    const reached = normalizedAgreement >= this.config.threshold

    return {
      reached,
      progress: normalizedAgreement,
      agreementLevel: normalizedAgreement,
      consensusType: reached
        ? normalizedAgreement > 0.9
          ? 'full'
          : 'partial'
        : undefined,
      agreeingParticipants: reached ? agreeingParticipants : [],
      keyAgreements: keyAgreements.slice(0, 5),
      detectedAt: new Date(),
    }
  }

  /**
   * Detect consensus with embedding similarity
   */
  private async detectWithEmbedding(
    recentMessages: Map<string, DiscussionMessage[]>,
    participants: DiscussionParticipant[]
  ): Promise<ConsensusResult> {
    // For embedding-based detection, we'd normally:
    // 1. Generate embeddings for each message
    // 2. Calculate cosine similarity between pairs
    // 3. Average similarity across all pairs
    // 4. If average > threshold, consensus reached

    // Since we don't have embedding API, fall back to keyword for now
    // TODO: Integrate with embedding API
    return this.detectWithKeywords(recentMessages, participants)
  }

  /**
   * Detect consensus with LLM analysis
   */
  private async detectWithLLM(
    recentMessages: Map<string, DiscussionMessage[]>,
    participants: DiscussionParticipant[]
  ): Promise<ConsensusResult> {
    // Build context for LLM
    const participantViews = Array.from(recentMessages.entries())
      .map(([id, msgs]) => {
        const participant = participants.find(p => p.id === id)
        return {
          name: participant?.agentName || id,
          content: msgs.map(m => m.content).join('\n---\n'),
        }
      })

    const prompt = `请分析以下参与者对同一问题的观点，判断他们是否达成共识或一致意见。

${participantViews.map(p => `【${p.name}】:\n${p.content}`).join('\n\n')}

请用JSON格式回答：
{
  "reached": true/false,
  "agreementLevel": 0.0-1.0,
  "consensusType": "full/partial/tentative/none",
  "summary": "简要总结共识内容",
  "keyAgreements": ["关键共识点1", "关键共识点2"],
  "disagreements": ["主要分歧点1", "主要分歧点2"]  // 如果没有共识
}`

    // For now, fall back to keyword-based detection
    // TODO: Call LLM with prompt and parse response
    return this.detectWithKeywords(recentMessages, participants)
  }

  /**
   * Get recent messages grouped by participant
   */
  private getRecentMessagesPerParticipant(
    messages: DiscussionMessage[],
    maxPerParticipant: number
  ): Map<string, DiscussionMessage[]> {
    const grouped = new Map<string, DiscussionMessage[]>()

    // Group messages by participant
    for (const msg of messages) {
      if (!grouped.has(msg.participantId)) {
        grouped.set(msg.participantId, [])
      }
      grouped.get(msg.participantId)!.push(msg)
    }

    // Take most recent N messages per participant
    const result = new Map<string, DiscussionMessage[]>()
    for (const [participantId, msgs] of grouped) {
      result.set(
        participantId,
        msgs.slice(-maxPerParticipant)
      )
    }

    return result
  }

  /**
   * Calculate message similarity (simple keyword overlap)
   */
  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = new Set(this.extractWords(text1))
    const words2 = new Set(this.extractWords(text2))

    if (words1.size === 0 || words2.size === 0) return 0

    const intersection = new Set([...words1].filter(x => words2.has(x)))
    const union = new Set([...words1, ...words2])

    return intersection.size / union.size
  }

  /**
   * Extract meaningful words from text
   */
  private extractWords(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fff]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2)
  }

  /**
   * Get consensus progress over time
   */
  getProgressHistory(): ConsensusResult[] {
    return this.recentChecks
  }

  /**
   * Check if consensus was recently reached
   */
  isConsensusReached(): boolean {
    if (this.recentChecks.length === 0) return false
    return this.recentChecks[this.recentChecks.length - 1].reached
  }

  /**
   * Update config
   */
  updateConfig(config: Partial<ConsensusConfig>): void {
    this.config = { ...this.config, ...config }
  }

  getConfig(): Required<ConsensusConfig> {
    return this.config
  }
}

// ── Consensus Tracker ────────────────────────────────────────────────────────────

export class ConsensusTracker {
  private detector: ConsensusDetector
  private messageCount = 0
  private lastConsensusCheck = 0

  constructor(config?: ConsensusConfig) {
    this.detector = new ConsensusDetector(config)
  }

  /**
   * Check if we should run consensus detection
   */
  shouldCheck(newMessageCount: number): boolean {
    const newMessages = newMessageCount - this.lastConsensusCheck
    return newMessages >= 2 // Check every 2 new messages
  }

  /**
   * Run detection and update state
   */
  async check(
    messages: DiscussionMessage[],
    participants: DiscussionParticipant[]
  ): Promise<ConsensusResult> {
    this.lastConsensusCheck = messages.length
    return await this.detector.detect(messages, participants)
  }

  getDetector(): ConsensusDetector {
    return this.detector
  }
}
