/**
 * Discussion Runtime — Participant Manager
 * Phase 3: Multi-Agent Discussion Module
 *
 * Responsibilities:
 * - Load DiscussionParticipant from DB
 * - Prepare LLM context for each participant
 * - Manage speak order per mode (parallel / round-robin / debate)
 */

import type {
  DiscussionParticipant,
  DiscussionSession,
  ParticipantLLMContext,
  ParticipantConfig,
  DebateStance,
} from './types'
import type { DiscussionMessage } from './types'
import prisma from '../../config/database'

// ── Load Participants ─────────────────────────────────────────────────────────

export async function loadParticipants(discussionId: string): Promise<DiscussionParticipant[]> {
  const participants = await prisma.discussionParticipant.findMany({
    where: { discussionId },
    orderBy: { speakOrder: 'asc' },
  })

  const agents = await prisma.agentDefinition.findMany({
    where: {
      id: { in: participants.map((item: any) => item.agentId) },
    },
  })

  const agentMap = new Map<string, any>(agents.map((agent: any) => [agent.id, agent]))

  return participants.map((row: any) => {
    const agent = agentMap.get(row.agentId)
    return {
      id: row.id,
      discussionId: row.discussionId,
      agentId: row.agentId,
      agentName: agent?.name || row.agentId,
      agentColor: agent?.color || '#6b7280',
      agentSystemPrompt: agent?.systemPrompt || '',
      position: row.position,
      stance: row.stance as DebateStance | undefined,
      responsibility: row.responsibility,
      speakOrder: row.speakOrder,
      isModerator: Boolean(row.isModerator),
      config: typeof row.config === 'string' ? JSON.parse(row.config) : (row.config || {}),
      createdAt: new Date(row.createdAt),
    }
  })
}

// ── Build System Prompt per Participant ─────────────────────────────────────────

export function buildSystemPrompt(ctx: ParticipantLLMContext): string {
  const { participant, topic, mode, roundIndex, turnIndex, otherParticipants } = ctx

  let prompt = participant.agentSystemPrompt

  // Add topic context
  prompt += `\n\n## 当前讨论话题\n"${topic}"`

  // Add mode-specific instructions
  if (mode === 'parallel') {
    prompt += `\n\n## 讨论模式：并行模式\n所有参与者同时作答，请给出你的独立观点。不要引用其他参与者的发言，专注于你自己的分析。`
  } else if (mode === 'round-robin') {
    prompt += `\n\n## 讨论模式：轮流发言\n请按顺序轮流发言，这是第 ${roundIndex} 轮第 ${turnIndex} 轮。你的发言要：
1. 独立思考，给出你的观点
2. 适当回应前面其他参与者的发言（如果有）
3. 推动讨论深入`
  } else if (mode === 'debate') {
    const stanceLabel = participant.stance === 'pro' ? '正方' : participant.stance === 'con' ? '反方' : '中立'
    prompt += `\n\n## 讨论模式：辩论模式\n你是 **${stanceLabel}**，立场：${participant.stance === 'pro' ? '支持该观点' : participant.stance === 'con' ? '反对该观点' : '保持中立分析'}
你需要在辩论中：
1. 坚持你的立场（除非被有力论点说服）
2. 反驳对方论点
3. 引用具体论据支持你的观点`

    if (otherParticipants.length > 0) {
      const othersSummary = otherParticipants
        .map(p => `【${p.agentName}（${p.stance === 'pro' ? '正方' : p.stance === 'con' ? '反方' : '中立'}）】`)
        .join('、')
      prompt += `\n\n当前参与方：${othersSummary}`
    }
  }

  // Add round/turn context
  if (roundIndex > 1) {
    prompt += `\n\n## 历史讨论摘要\n（之前的 ${roundIndex - 1} 轮讨论已有，请参考但不要重复之前的观点）`
  }

  // Add previous messages if any
  if (ctx.previousMessages.length > 0) {
    const recentMessages = ctx.previousMessages.slice(-10)
    const historyText = recentMessages
      .map(m => `<${m.agentName}>: ${m.content}`)
      .join('\n')
    prompt += `\n\n## 最近发言\n${historyText}`
  }

  // Add extra prompt overrides
  if (participant.config.extraPrompt) {
    prompt += `\n\n## 额外要求\n${participant.config.extraPrompt}`
  }

  return prompt
}

// ── Get Speak Order for Mode ───────────────────────────────────────────────────

export function getSpeakOrder(
  mode: 'parallel' | 'round-robin' | 'debate',
  roundIndex: number,
  participants: DiscussionParticipant[]
): DiscussionParticipant[] {
  if (mode === 'parallel') {
    // All participants speak simultaneously (no order needed, returned as-is)
    return [...participants].sort((a, b) => a.speakOrder - b.speakOrder)
  }

  if (mode === 'round-robin') {
    // Standard round-robin: each participant speaks once per round
    // Order stays consistent across rounds
    return [...participants].sort((a, b) => a.speakOrder - b.speakOrder)
  }

  if (mode === 'debate') {
    // Debate mode: pro → con → pro → con, with moderator optional
    const pro = participants.filter(p => p.stance === 'pro').sort((a, b) => a.speakOrder - b.speakOrder)
    const con = participants.filter(p => p.stance === 'con').sort((a, b) => a.speakOrder - b.speakOrder)
    const neutral = participants.filter(p => p.stance !== 'pro' && p.stance !== 'con')

    const ordered: DiscussionParticipant[] = []
    // Alternate pro/con based on round parity
    if (roundIndex % 2 === 1) {
      ordered.push(...pro, ...con)
    } else {
      ordered.push(...con, ...pro)
    }
    ordered.push(...neutral)
    return ordered
  }

  return participants
}

// ── Build LLM Context for Participant ────────────────────────────────────────

export function buildLLMContext(
  participant: DiscussionParticipant,
  session: DiscussionSession,
  roundIndex: number,
  turnIndex: number,
  previousMessages: DiscussionMessage[]
): ParticipantLLMContext {
  const otherParticipants = session.participants.filter(p => p.id !== participant.id)

  return {
    participant,
    topic: session.topic,
    mode: session.mode,
    roundIndex,
    turnIndex,
    previousMessages,
    otherParticipants,
    systemPrompt: buildSystemPrompt({
      participant,
      topic: session.topic,
      mode: session.mode,
      roundIndex,
      turnIndex,
      previousMessages,
      otherParticipants,
      systemPrompt: participant.agentSystemPrompt,
    }),
  }
}

// ── Add Participant ────────────────────────────────────────────────────────────

export async function addParticipant(
  discussionId: string,
  agentId: string,
  options: {
    position?: number
    stance?: DebateStance
    responsibility?: string
    speakOrder?: number
    isModerator?: boolean
    config?: ParticipantConfig
  } = {}
): Promise<DiscussionParticipant> {
  const agentDef = await prisma.agentDefinition.findUnique({
    where: { id: agentId },
  })

  if (!agentDef) {
    throw new Error(`Agent ${agentId} not found`)
  }

  const lastParticipant = await prisma.discussionParticipant.findFirst({
    where: { discussionId },
    orderBy: { speakOrder: 'desc' },
  })

  const nextOrder = options.speakOrder ?? ((lastParticipant?.speakOrder ?? 0) + 1)

  const row = await prisma.discussionParticipant.create({
    data: {
      discussionId,
      agentId,
      position: options.position ?? 0,
      stance: options.stance ?? null,
      responsibility: options.responsibility ?? null,
      speakOrder: nextOrder,
      isModerator: options.isModerator ?? false,
      config: JSON.stringify(options.config ?? {}),
    },
  })

  return {
    id: row.id,
    discussionId: row.discussionId,
    agentId: row.agentId,
    agentName: agentDef.name,
    agentColor: agentDef.color || '#6b7280',
    agentSystemPrompt: agentDef.systemPrompt,
    position: row.position,
    stance: row.stance as DebateStance | undefined,
    responsibility: row.responsibility,
    speakOrder: row.speakOrder,
    isModerator: Boolean(row.isModerator),
    config: typeof row.config === 'string' ? JSON.parse(row.config) : (row.config || {}),
    createdAt: new Date(row.createdAt),
  }
}
