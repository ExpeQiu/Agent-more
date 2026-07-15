/**
 * Debate Mode V2 — Enhanced Structured Debate
 *
 * Features:
 * - Structured stages: opening → rebuttal → counter → closing → adjudication
 * - Pro/Con side management
 * - Rebuttal tracking
 * - Judge/adjudicator scoring
 * - Debate result storage
 */

import type {
  DiscussionParticipant,
  DiscussionMessage,
  DebateStage,
  DebateConfig,
  DebateStance,
  AdjudicationReport,
  RoundScore,
} from './types'
import { buildLLMContext } from './participant-manager'
import type { ParticipantLLMContext } from './types'
import type { LLMMessage } from '../llm-gateway/types'

// ── Debate Stage Flow ───────────────────────────────────────────────────────────

export const DEBATE_STAGE_ORDER: DebateStage[] = [
  'opening',
  'rebuttal',
  'counter',
  'closing',
  'adjudication',
]

export function getNextStage(current: DebateStage): DebateStage | null {
  const idx = DEBATE_STAGE_ORDER.indexOf(current)
  if (idx === -1 || idx >= DEBATE_STAGE_ORDER.length - 1) return null
  return DEBATE_STAGE_ORDER[idx + 1]
}

export function isRebuttalStage(stage: DebateStage): boolean {
  return stage === 'rebuttal' || stage === 'counter'
}

// ── Debate Turn Structure ────────────────────────────────────────────────────────

export interface DebateTurn {
  stage: DebateStage
  roundIndex: number
  turnIndex: number
  speakerId: string
  speakerName: string
  stance: DebateStance
  targetId?: string // For rebuttals: who is being rebutted
  prompt: string
}

export function buildDebateTurns(
  participants: DiscussionParticipant[],
  config: DebateConfig,
  topic: string
): DebateTurn[] {
  const turns: DebateTurn[] = []
  const proParticipants = participants.filter(p => p.stance === 'pro')
  const conParticipants = participants.filter(p => p.stance === 'con')
  const proSide = proParticipants[0]
  const conSide = conParticipants[0]

  if (!proSide || !conSide) {
    throw new Error('Debate mode requires at least one pro and one con participant')
  }

  const maxRounds = config.rounds || 3

  for (let round = 1; round <= maxRounds; round++) {
    // Opening statements (round 1 only)
    if (config.openingRequired && round === 1) {
      turns.push({
        stage: 'opening',
        roundIndex: round,
        turnIndex: 1,
        speakerId: proSide.id,
        speakerName: proSide.agentName,
        stance: 'pro',
        prompt: buildOpeningPrompt(topic, 'pro'),
      })
      turns.push({
        stage: 'opening',
        roundIndex: round,
        turnIndex: 2,
        speakerId: conSide.id,
        speakerName: conSide.agentName,
        stance: 'con',
        prompt: buildOpeningPrompt(topic, 'con'),
      })
    }

    // Rebuttal rounds
    if (round <= config.rebuttalRounds) {
      turns.push({
        stage: 'rebuttal',
        roundIndex: round,
        turnIndex: turns.length + 1,
        speakerId: proSide.id,
        speakerName: proSide.agentName,
        stance: 'pro',
        targetId: conSide.id,
        prompt: buildRebuttalPrompt(topic, 'pro', round),
      })
      turns.push({
        stage: 'rebuttal',
        roundIndex: round,
        turnIndex: turns.length + 1,
        speakerId: conSide.id,
        speakerName: conSide.agentName,
        stance: 'con',
        targetId: proSide.id,
        prompt: buildRebuttalPrompt(topic, 'con', round),
      })
    }

    // Counter-rebuttal (if multiple rebuttal rounds)
    if (config.rebuttalRounds > 1 && round < config.rebuttalRounds) {
      turns.push({
        stage: 'counter',
        roundIndex: round,
        turnIndex: turns.length + 1,
        speakerId: proSide.id,
        speakerName: proSide.agentName,
        stance: 'pro',
        targetId: conSide.id,
        prompt: buildCounterPrompt(topic, 'pro', round),
      })
      turns.push({
        stage: 'counter',
        roundIndex: round,
        turnIndex: turns.length + 1,
        speakerId: conSide.id,
        speakerName: conSide.agentName,
        stance: 'con',
        targetId: proSide.id,
        prompt: buildCounterPrompt(topic, 'con', round),
      })
    }
  }

  // Closing statements
  if (config.closingRequired) {
    turns.push({
      stage: 'closing',
      roundIndex: maxRounds,
      turnIndex: turns.length + 1,
      speakerId: conSide.id,
      speakerName: conSide.agentName,
      stance: 'con',
      prompt: buildClosingPrompt(topic, 'con'),
    })
    turns.push({
      stage: 'closing',
      roundIndex: maxRounds,
      turnIndex: turns.length + 1,
      speakerId: proSide.id,
      speakerName: proSide.agentName,
      stance: 'pro',
      prompt: buildClosingPrompt(topic, 'pro'),
    })
  }

  return turns
}

// ── Prompt Builders ─────────────────────────────────────────────────────────────

function buildOpeningPrompt(topic: string, stance: DebateStance): string {
  const stanceText = stance === 'pro'
    ? '支持这个观点'
    : '反对这个观点'
  return `你是一场结构化辩论中的${stanceText}方辩手。

辩题："${topic}"

请发表开场陈述，明确阐述你的立场和核心论点。开场陈述应该：
1. 清晰表明你的立场
2. 提出2-3个核心论据
3. 为后续辩论奠定基础

请用有说服力的语言进行陈述。`
}

function buildRebuttalPrompt(topic: string, stance: DebateStance, round: number): string {
  const stanceText = stance === 'pro' ? '支持' : '反对'
  return `你是一场结构化辩论中${stanceText}方辩手，正在第${round}轮反驳。

辩题："${topic}"

请针对对方刚才的陈述提出有力的反驳：
1. 指出对方论点中的逻辑漏洞或薄弱之处
2. 用新的证据或案例加强你的立场
3. 不要只是重复你的观点，而是要有效回应质疑

这是第${round}轮，请进行深度反驳。`
}

function buildCounterPrompt(topic: string, stance: DebateStance, round: number): string {
  const stanceText = stance === 'pro' ? '支持' : '反对'
  return `你是一场结构化辩论中${stanceText}方辩手，正在进行第${round}轮的再反驳。

辩题："${topic}"

请针对对方刚才的反驳进行再回应：
1. 巩固你的核心立场
2. 进一步深化你的论据
3. 尝试预测对方下一步的论点并先发制人

请进行有力的再辩。`
}

function buildClosingPrompt(topic: string, stance: DebateStance): string {
  const stanceText = stance === 'pro' ? '支持' : '反对'
  return `你是一场结构化辩论中${stanceText}方辩手，现在进行最终总结陈述。

辩题："${topic}"

请做总结陈词：
1. 回顾你的核心论点
2. 指出对方立场的根本性问题
3. 强调为什么你的立场更站得住脚
4. 给听众留下深刻印象

请做有力的最终陈述。`
}

// ── Debate Context Builder ──────────────────────────────────────────────────────

export function buildDebateContext(
  participant: DiscussionParticipant,
  topic: string,
  allMessages: DiscussionMessage[],
  currentStage: DebateStage,
  roundIndex: number,
  turnIndex: number
): ParticipantLLMContext {
  // Get recent debate messages for context
  const recentMessages = allMessages.slice(-10)
  const debateHistory = recentMessages
    .filter(m => m.participantId !== participant.id)
    .map(m => `[${m.agentName}]: ${m.content}`)
    .join('\n\n')

  const stageInstruction = getStageInstruction(currentStage)

  const customSystemPrompt = `${participant.agentSystemPrompt}

【辩论模式额外指令】
当前阶段：${currentStage}
${stageInstruction}

【辩论历史】
${debateHistory || '暂无'}

请根据当前阶段和辩论历史，给出你的发言。`

  return {
    participant,
    topic,
    mode: 'debate',
    roundIndex,
    turnIndex,
    previousMessages: recentMessages,
    otherParticipants: [],
    systemPrompt: customSystemPrompt,
  }
}

function getStageInstruction(stage: DebateStage): string {
  switch (stage) {
    case 'opening':
      return '这是开场陈述阶段。请清晰阐述你的立场和核心论点。'
    case 'rebuttal':
      return '这是反驳阶段。请针对对方的论点进行有力反驳。'
    case 'counter':
      return '这是再反驳阶段。请针对对方对你的反驳进行回应。'
    case 'closing':
      return '这是总结阶段。请做最终陈述，总结你的立场。'
    case 'adjudication':
      return '辩论已结束，等待裁判评分。'
    default:
      return ''
  }
}

// ── Debate Result ───────────────────────────────────────────────────────────────

export interface DebateResult {
  discussionId: string
  totalRounds: number
  totalTurns: number
  proMessages: DiscussionMessage[]
  conMessages: DiscussionMessage[]
  proKeyPoints: string[]
  conKeyPoints: string[]
  winner?: 'pro' | 'con' | 'tie'
  adjudicationReport?: AdjudicationReport
  createdAt: Date
}

export function buildDebateResult(
  discussionId: string,
  messages: DiscussionMessage[],
  participants: DiscussionParticipant[],
  adjudicationReport?: AdjudicationReport
): DebateResult {
  const proParticipant = participants.find(p => p.stance === 'pro')
  const conParticipant = participants.find(p => p.stance === 'con')

  const proMessages = messages.filter(m => m.participantId === proParticipant?.id)
  const conMessages = messages.filter(m => m.participantId === conParticipant?.id)

  const proKeyPoints = extractKeyPoints(proMessages)
  const conKeyPoints = extractKeyPoints(conMessages)

  return {
    discussionId,
    totalRounds: Math.max(...messages.map(m => m.roundIndex), 0),
    totalTurns: messages.length,
    proMessages,
    conMessages,
    proKeyPoints,
    conKeyPoints,
    winner: adjudicationReport?.winner,
    adjudicationReport,
    createdAt: new Date(),
  }
}

function extractKeyPoints(messages: DiscussionMessage[]): string[] {
  // Simple extraction: get first 200 chars of each message as summary
  return messages.map(m => {
    const cleaned = m.content.trim().replace(/\n+/g, ' ')
    return cleaned.length > 200 ? cleaned.substring(0, 200) + '...' : cleaned
  })
}

// ── Score Dimensions ───────────────────────────────────────────────────────────

export const SCORE_DIMENSIONS = ['logic', 'evidence', 'persuasion', 'innovation'] as const

export type ScoreDimension = typeof SCORE_DIMENSIONS[number]

export function validateScoreDimension(dim: string): dim is ScoreDimension {
  return SCORE_DIMENSIONS.includes(dim as ScoreDimension)
}

export function getDimensionLabel(dim: ScoreDimension): string {
  const labels: Record<ScoreDimension, string> = {
    logic: '逻辑性',
    evidence: '证据充分性',
    persuasion: '说服力',
    innovation: '创新性',
  }
  return labels[dim]
}
