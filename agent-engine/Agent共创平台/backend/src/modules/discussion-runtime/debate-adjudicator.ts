/**
 * Debate Adjudicator — Judge/Scoring System
 *
 * Evaluates debate performance across multiple dimensions:
 * - Logic (逻辑性)
 * - Evidence (证据充分性)
 * - Persuasion (说服力)
 * - Innovation (创新性)
 *
 * Generates adjudication report with winner declaration.
 */

import type {
  DiscussionParticipant,
  DiscussionMessage,
  AdjudicationReport,
  RoundScore,
  DebateStance,
} from './types'
import { SCORE_DIMENSIONS, getDimensionLabel } from './debate-mode'

type ScoreDimension = RoundScore['dimension']

// ── Adjudicator Interface ──────────────────────────────────────────────────────

export interface AdjudicatorConfig {
  dimensions: ScoreDimension[]
  openaiApiKey?: string
  modelId?: string
}

// ── Adjudicator Class ───────────────────────────────────────────────────────────

export class DebateAdjudicator {
  private config: AdjudicatorConfig

  constructor(config: AdjudicatorConfig) {
    this.config = {
      dimensions: [...SCORE_DIMENSIONS],
      modelId: 'gpt-4o',
      ...config,
    }
  }

  /**
   * Generate full adjudication report
   */
  async generateReport(
    discussionId: string,
    participants: DiscussionParticipant[],
    messages: DiscussionMessage[]
  ): Promise<AdjudicationReport> {
    const proParticipant = participants.find(p => p.stance === 'pro')
    const conParticipant = participants.find(p => p.stance === 'con')

    if (!proParticipant || !conParticipant) {
      throw new Error('Adjudication requires at least one pro and one con participant')
    }

    const proMessages = messages.filter(m => m.participantId === proParticipant.id)
    const conMessages = messages.filter(m => m.participantId === conParticipant.id)

    // Calculate scores for each dimension
    const proScores = this.evaluateSide(proMessages, 'pro')
    const conScores = this.evaluateSide(conMessages, 'con')

    // Determine winner
    const { winner, reasoning, keyDecidingFactors } = this.determineWinner(
      proScores,
      conScores,
      proMessages,
      conMessages
    )

    const report: AdjudicationReport = {
      discussionId,
      winner,
      proScore: this.averageScore(proScores),
      conScore: this.averageScore(conScores),
      proStrengths: this.extractStrengths(proMessages, 'pro'),
      conStrengths: this.extractStrengths(conMessages, 'con'),
      proWeaknesses: this.extractWeaknesses(proMessages, 'pro'),
      conWeaknesses: this.extractWeaknesses(conMessages, 'con'),
      reasoning,
      keyDecidingFactors,
      generatedAt: new Date(),
    }

    return report
  }

  /**
   * Score a single participant's messages
   */
  evaluateSide(messages: DiscussionMessage[], stance: DebateStance): Record<ScoreDimension, number> {
    const scores: Record<ScoreDimension, number> = {
      logic: 0,
      evidence: 0,
      persuasion: 0,
      innovation: 0,
    }

    if (messages.length === 0) return scores

    // Simple heuristic scoring (can be replaced with LLM-based scoring)
    for (const msg of messages) {
      const content = msg.content

      // Logic: presence of connective words and structured arguments
      const logicIndicators = [
        '因为', '所以', '因此', '然而', '但是', '虽然', '如果',
        '首先', '其次', '最后', '一方面', '另一方面', '综上',
        'because', 'therefore', 'however', 'although', 'if',
      ]
      const logicCount = logicIndicators.filter(w => content.includes(w)).length
      scores.logic += Math.min(logicCount * 0.5, 3)

      // Evidence: presence of data, studies, examples
      const evidenceIndicators = [
        '研究', '数据', '显示', '表明', '根据', '统计', '实验',
        '案例', '事实', '研究显示', '数据表明',
        'research', 'data', 'study', 'experiment', 'evidence',
      ]
      const evidenceCount = evidenceIndicators.filter(w => content.includes(w)).length
      scores.evidence += Math.min(evidenceCount * 0.5, 3)

      // Persuasion: emotional language and calls to action
      const persuasionIndicators = [
        '必须', '应该', '重要', '关键', '相信', '一定', '毫无疑问',
        '请注意', '必须承认', '毫无疑问', '显然',
        'must', 'should', 'important', 'believe', 'clearly',
      ]
      const persuasionCount = persuasionIndicators.filter(w => content.includes(w)).length
      scores.persuasion += Math.min(persuasionCount * 0.5, 3)

      // Innovation: novel ideas and creative solutions
      const innovationIndicators = [
        '创新', '突破', '独特', '新颖', '前所未有', '开创',
        ' novel', 'innovative', 'creative', 'unique', 'breakthrough',
      ]
      const innovationCount = innovationIndicators.filter(w => content.includes(w)).length
      scores.innovation += Math.min(innovationCount * 0.5, 3)
    }

    // Normalize scores to 0-10 range
    const messageCount = messages.length || 1
    for (const dim of SCORE_DIMENSIONS) {
      scores[dim] = Math.min(scores[dim] / Math.sqrt(messageCount), 10)
    }

    return scores
  }

  /**
   * Determine winner based on scores
   */
  private determineWinner(
    proScores: Record<ScoreDimension, number>,
    conScores: Record<ScoreDimension, number>,
    proMessages: DiscussionMessage[],
    conMessages: DiscussionMessage[]
  ): { winner: 'pro' | 'con' | 'tie'; reasoning: string; keyDecidingFactors: string[] } {
    const proTotal = this.totalScore(proScores)
    const conTotal = this.totalScore(conScores)
    const diff = Math.abs(proTotal - conTotal)

    let winner: 'pro' | 'con' | 'tie'
    if (diff < 2) {
      winner = 'tie'
    } else {
      winner = proTotal > conTotal ? 'pro' : 'con'
    }

    // Determine key factors
    const factors: string[] = []
    for (const dim of SCORE_DIMENSIONS) {
      const proDimScore = proScores[dim]
      const conDimScore = conScores[dim]
      const dimDiff = proDimScore - conDimScore
      if (Math.abs(dimDiff) > 1) {
        const winnerSide = dimDiff > 0 ? '正方' : '反方'
        factors.push(`${winnerSide}在${getDimensionLabel(dim)}方面表现更佳`)
      }
    }

    const reasoning = winner === 'tie'
      ? '双方表现相当，各有优劣，最终判定为平局。'
      : winner === 'pro'
      ? `正方整体表现更优，总分${proTotal.toFixed(1)} vs ${conTotal.toFixed(1)}，在多个维度上占据优势。`
      : `反方整体表现更优，总分${conTotal.toFixed(1)} vs ${proTotal.toFixed(1)}，在多个维度上占据优势。`

    return { winner, reasoning, keyDecidingFactors: factors }
  }

  /**
   * Extract strengths from messages
   */
  private extractStrengths(messages: DiscussionMessage[], stance: DebateStance): string[] {
    const strengths: string[] = []
    const allContent = messages.map(m => m.content).join(' ')

    if (allContent.includes('研究') || allContent.includes('数据') || allContent.includes('实验')) {
      strengths.push('提供了数据和案例支撑')
    }
    if (allContent.includes('因为') || allContent.includes('所以') || allContent.includes('因此')) {
      strengths.push('论证逻辑清晰')
    }
    if (allContent.includes('但是') || allContent.includes('然而') || allContent.includes('反驳')) {
      strengths.push('善于指出对方问题')
    }
    if (allContent.includes('创新') || allContent.includes('突破') || allContent.includes('独特')) {
      strengths.push('提出了创新性观点')
    }

    return strengths.slice(0, 3) // Max 3 strengths
  }

  /**
   * Extract weaknesses from messages
   */
  private extractWeaknesses(messages: DiscussionMessage[], stance: DebateStance): string[] {
    const weaknesses: string[] = []
    const allContent = messages.join(' ')

    // Check for common weaknesses
    const hasLogicGaps = !(allContent.includes('因为') || allContent.includes('所以'))
    const hasEvidence = allContent.includes('研究') || allContent.includes('数据')

    if (hasLogicGaps && messages.length > 2) {
      weaknesses.push('部分论点逻辑不够严密')
    }
    if (!hasEvidence && messages.length > 3) {
      weaknesses.push('缺少具体数据和案例支撑')
    }

    return weaknesses.slice(0, 3) // Max 3 weaknesses
  }

  /**
   * Calculate total score
   */
  private totalScore(scores: Record<ScoreDimension, number>): number {
    return SCORE_DIMENSIONS.reduce((sum, dim) => sum + scores[dim], 0)
  }

  /**
   * Calculate average score
   */
  private averageScore(scores: Record<ScoreDimension, number>): number {
    return this.totalScore(scores) / SCORE_DIMENSIONS.length
  }

  /**
   * Generate round-by-round scores
   */
  generateRoundScores(
    discussionId: string,
    participants: DiscussionParticipant[],
    messages: DiscussionMessage[]
  ): RoundScore[] {
    const roundScores: RoundScore[] = []
    const proParticipant = participants.find(p => p.stance === 'pro')
    const conParticipant = participants.find(p => p.stance === 'con')

    if (!proParticipant || !conParticipant) return []

    const maxRound = Math.max(...messages.map(m => m.roundIndex), 0)

    for (let round = 1; round <= maxRound; round++) {
      const roundMessages = messages.filter(m => m.roundIndex === round)

      const proRoundMessages = roundMessages.filter(m => m.participantId === proParticipant.id)
      const conRoundMessages = roundMessages.filter(m => m.participantId === conParticipant.id)

      const proScores = this.evaluateSide(proRoundMessages, 'pro')
      const conScores = this.evaluateSide(conRoundMessages, 'con')

      for (const dim of SCORE_DIMENSIONS) {
        roundScores.push({
          roundScoreId: `${discussionId}-r${round}-${dim}`,
          discussionId,
          roundIndex: round,
          participantId: proParticipant.id,
          dimension: dim,
          score: proScores[dim],
        })
        roundScores.push({
          roundScoreId: `${discussionId}-r${round}-${dim}-con`,
          discussionId,
          roundIndex: round,
          participantId: conParticipant.id,
          dimension: dim,
          score: conScores[dim],
        })
      }
    }

    return roundScores
  }
}

// ── Adjudication Storage ────────────────────────────────────────────────────────

export async function saveAdjudicationReport(
  prisma: any,
  report: AdjudicationReport,
  scores: RoundScore[]
): Promise<void> {
  try {
    await prisma.discussionAdjudication.create({
      data: {
        id: crypto.randomUUID(),
        discussionId: report.discussionId,
        winner: report.winner,
        proScore: report.proScore,
        conScore: report.conScore,
        proStrengths: JSON.stringify(report.proStrengths),
        conStrengths: JSON.stringify(report.conStrengths),
        proWeaknesses: JSON.stringify(report.proWeaknesses),
        conWeaknesses: JSON.stringify(report.conWeaknesses),
        reasoning: report.reasoning,
        keyDecidingFactors: JSON.stringify(report.keyDecidingFactors),
      },
    })

    if (scores.length > 0) {
      await prisma.discussionRoundScore.createMany({
        data: scores.map((score) => ({
          roundScoreId: score.roundScoreId,
          discussionId: score.discussionId,
          roundIndex: score.roundIndex,
          participantId: score.participantId,
          dimension: score.dimension,
          score: score.score,
        })),
      })
    }
  } catch (err) {
    console.error('[DebateAdjudicator] Failed to save adjudication:', err)
  }
}
