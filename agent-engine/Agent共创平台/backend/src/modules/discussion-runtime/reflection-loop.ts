/**
 * Reflection Loop — Agent Self-Reflection System
 *
 * Triggers at configured intervals to have agents reflect on:
 * - Their own arguments and potential blind spots
 * - Strong points from opponents
 * - Whether they need to adjust their position
 *
 * Reflection results are injected into the next round of discussion.
 */

import type {
  DiscussionMessage,
  DiscussionParticipant,
  ReflectionConfig,
  DiscussionSession,
} from './types'

// ── Default Config ─────────────────────────────────────────────────────────────

export const DEFAULT_REFLECTION_CONFIG: Required<ReflectionConfig> = {
  enabled: true,
  triggerAfterRounds: 2,
  maxReflectionCount: 2,
  reflectionPrompt: `请反思你自己的观点和论据：
1. 你的核心论点是否有可能存在盲点？
2. 对方提出了哪些值得你认真考虑的反驳？
3. 你是否需要调整或强化你的立场？

请进行诚实的自我反思，并用150字以内总结你的思考。`,
}

// ── Reflection Result ──────────────────────────────────────────────────────────

export interface ReflectionResult {
  participantId: string
  participantName: string
  reflection: string
  blindSpots: string[]
  adjustments: string[]
  timestamp: Date
}

export interface ReflectionCycle {
  cycleIndex: number
  roundIndex: number
  reflections: ReflectionResult[]
  injectedIntoDiscussion: boolean
}

// ── Reflection Loop Class ──────────────────────────────────────────────────────

export class ReflectionLoop {
  private config: Required<ReflectionConfig>
  private cycles: ReflectionCycle[] = []
  private reflectionCount = 0

  constructor(config: Partial<ReflectionConfig> = {}) {
    this.config = { ...DEFAULT_REFLECTION_CONFIG, ...config }
  }

  /**
   * Check if reflection should be triggered
   */
  shouldTrigger(currentRound: number): boolean {
    if (!this.config.enabled) return false
    if (this.reflectionCount >= this.config.maxReflectionCount) return false

    // Trigger after configured number of rounds
    return currentRound > 0 && currentRound % this.config.triggerAfterRounds === 0
  }

  /**
   * Generate reflection prompt for a specific participant
   */
  buildReflectionPrompt(
    participant: DiscussionParticipant,
    allMessages: DiscussionMessage[]
  ): string {
    // Get messages from this participant
    const ownMessages = allMessages.filter(m => m.participantId === participant.id)
    const ownContent = ownMessages.map(m => m.content).join('\n\n')

    // Get messages from other participants
    const otherMessages = allMessages.filter(m => m.participantId !== participant.id)
    const otherContent = otherMessages.map(m =>
      `[${m.agentName}]: ${m.content}`
    ).join('\n\n')

    return `【反思环节】

你是${participant.agentName}，正在参与一场讨论。

【你自己的观点】
${ownContent || '（暂无）'}

【其他参与者的观点】
${otherContent || '（暂无）'}

${this.config.reflectionPrompt}

请认真思考后给出你的反思。`
  }

  /**
   * Build reflection system prompt
   */
  buildReflectionSystemPrompt(): string {
    return `你是一位善于自我反思的思考者。

在反思环节，你需要：
1. 诚实地评估自己的论点 strengths and weaknesses
2. 认真考虑对手的观点中可能有价值的部分
3. 思考是否需要修正或强化自己的立场
4. 不要为了面子而固执己见

反思应该：
- 简短精炼（150字以内）
- 诚实直接
- 有建设性

格式要求：用中文回答，直接写出你的反思内容，不需要额外格式。`
  }

  /**
   * Parse reflection result from LLM output
   */
  parseReflection(
    participant: DiscussionParticipant,
    llmOutput: string
  ): ReflectionResult {
    // Simple parsing - extract key parts
    const blindSpots: string[] = []
    const adjustments: string[] = []

    // Look for common patterns
    const lines = llmOutput.split('\n')

    for (const line of lines) {
      const lower = line.toLowerCase()
      if (lower.includes('盲点') || lower.includes('弱点') || lower.includes('不足')) {
        blindSpots.push(line.replace(/[#*：:]/g, '').trim())
      }
      if (lower.includes('调整') || lower.includes('修正') || lower.includes('改变')) {
        adjustments.push(line.replace(/[#*：:]/g, '').trim())
      }
    }

    return {
      participantId: participant.id,
      participantName: participant.agentName,
      reflection: llmOutput.trim(),
      blindSpots: blindSpots.slice(0, 3),
      adjustments: adjustments.slice(0, 3),
      timestamp: new Date(),
    }
  }

  /**
   * Create a reflection cycle
   */
  createCycle(roundIndex: number): ReflectionCycle {
    const cycle: ReflectionCycle = {
      cycleIndex: this.cycles.length,
      roundIndex,
      reflections: [],
      injectedIntoDiscussion: false,
    }
    this.cycles.push(cycle)
    this.reflectionCount++
    return cycle
  }

  /**
   * Add reflection to current cycle
   */
  addReflection(cycle: ReflectionCycle, result: ReflectionResult): void {
    cycle.reflections.push(result)
  }

  /**
   * Mark cycle as injected
   */
  markInjected(cycle: ReflectionCycle): void {
    cycle.injectedIntoDiscussion = true
  }

  /**
   * Build injection message for next round
   */
  buildInjectionMessage(cycle: ReflectionCycle): string {
    const reflections = cycle.reflections.map(r =>
      `【${r.participantName}的反思】\n${r.reflection}`
    ).join('\n\n')

    return `【反思环节结束】\n\n${reflections}\n\n请各位在下一轮中基于反思内容继续讨论。`
  }

  /**
   * Build injection content for specific participant
   */
  buildParticipantInjection(result: ReflectionResult): string {
    const parts: string[] = [`【${result.participantName}的反思后调整】`]

    if (result.adjustments.length > 0) {
      parts.push('基于反思，我的立场调整如下：')
      parts.push(...result.adjustments)
    } else {
      parts.push('经过反思，我的立场保持不变，但更加明确了以下观点：')
      parts.push(result.reflection)
    }

    return parts.join('\n')
  }

  /**
   * Get reflection summary
   */
  getSummary(): {
    totalCycles: number
    currentReflectionCount: number
    canTriggerMore: boolean
    cycles: ReflectionCycle[]
  } {
    return {
      totalCycles: this.cycles.length,
      currentReflectionCount: this.reflectionCount,
      canTriggerMore: this.reflectionCount < this.config.maxReflectionCount,
      cycles: this.cycles,
    }
  }

  /**
   * Check if we can trigger more reflections
   */
  canTriggerMore(): boolean {
    return this.reflectionCount < this.config.maxReflectionCount
  }

  /**
   * Reset for new discussion
   */
  reset(): void {
    this.cycles = []
    this.reflectionCount = 0
  }

  getConfig(): Required<ReflectionConfig> {
    return this.config
  }

  getCycles(): ReflectionCycle[] {
    return this.cycles
  }
}

// ── Reflection Manager ─────────────────────────────────────────────────────────

export class ReflectionManager {
  private loop: ReflectionLoop

  constructor(config?: ReflectionConfig) {
    this.loop = new ReflectionLoop(config)
  }

  /**
   * Start reflection cycle
   */
  startCycle(roundIndex: number): ReflectionCycle | null {
    if (!this.loop.shouldTrigger(roundIndex)) {
      return null
    }
    return this.loop.createCycle(roundIndex)
  }

  /**
   * Build prompts for all participants
   */
  buildPrompts(
    participants: DiscussionParticipant[],
    allMessages: DiscussionMessage[]
  ): Map<string, string> {
    const prompts = new Map<string, string>()

    for (const participant of participants) {
      // Skip moderators
      if (participant.isModerator) continue

      prompts.set(
        participant.id,
        this.loop.buildReflectionPrompt(participant, allMessages)
      )
    }

    return prompts
  }

  /**
   * Get injection message for next round
   */
  getInjectionMessage(): string | null {
    const cycles = this.loop.getCycles()
    const lastCycle = cycles[cycles.length - 1]

    if (!lastCycle || lastCycle.injectedIntoDiscussion) {
      return null
    }

    const message = this.loop.buildInjectionMessage(lastCycle)
    this.loop.markInjected(lastCycle)

    return message
  }

  /**
   * Get system prompt for reflection
   */
  getSystemPrompt(): string {
    return this.loop.buildReflectionSystemPrompt()
  }

  /**
   * Parse LLM output to reflection result
   */
  parseReflection(
    participant: DiscussionParticipant,
    llmOutput: string
  ): ReflectionResult {
    return this.loop.parseReflection(participant, llmOutput)
  }

  /**
   * Check if more reflections possible
   */
  canTriggerMore(): boolean {
    return this.loop.canTriggerMore()
  }

  /**
   * Get summary
   */
  getSummary() {
    return this.loop.getSummary()
  }
}
