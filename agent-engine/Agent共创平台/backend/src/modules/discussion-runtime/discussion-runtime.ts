/**
 * Discussion Runtime — Core Engine
 * Phase 3: Multi-Agent Discussion Module
 *
 * Manages discussion lifecycle:
 * - parallel: all participants respond simultaneously
 * - round-robin: participants speak in order, multiple rounds
 * - debate: pro/con structured debate
 *
 * Each participant's turn calls the LLM Gateway.
 * All SSE events are emitted through the provided emitter callback.
 */

import type {
  DiscussionSession,
  DiscussionMessage,
  DiscussionConfig,
  DiscussionSSEEvent,
  ParticipantLLMContext,
  DiscussionMode,
} from './types'
import { getSpeakOrder, buildLLMContext } from './participant-manager'
import { generateSummary, saveSummary } from './summarizer'
import type { LLMMessage } from '../llm-gateway/types'
import prisma from '../../config/database'

// ── Event Emitter Type ─────────────────────────────────────────────────────────

export type SSEEmitter = (event: DiscussionSSEEvent) => void

// ── Discussion Engine ──────────────────────────────────────────────────────────

export class DiscussionRuntime {
  private session: DiscussionSession
  private config: DiscussionConfig
  private messages: DiscussionMessage[] = []
  private emitter: SSEEmitter
  private aborted = false
  private paused = false

  constructor(
    session: DiscussionSession,
    config: DiscussionConfig,
    emitter: SSEEmitter
  ) {
    this.session = session
    this.config = config
    this.emitter = emitter
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    this.aborted = false
    this.paused = false

    // Update status to RUNNING
    await this.updateStatus('RUNNING')

    this.emit({
      type: 'discussion_start',
      discussionId: this.session.id,
      timestamp: Date.now(),
    })

    try {
      if (this.session.mode === 'parallel') {
        await this.runParallelMode()
      } else if (this.session.mode === 'round-robin') {
        await this.runRoundRobinMode()
      } else if (this.session.mode === 'debate') {
        await this.runDebateMode()
      }

      if (!this.aborted) {
        await this.finalize()
      }
    } catch (err: any) {
      this.emit({
        type: 'discussion_error',
        discussionId: this.session.id,
        error: err.message,
        timestamp: Date.now(),
      })
      await this.updateStatus('CANCELLED')
    }
  }

  async pause(): Promise<void> {
    this.paused = true
    await this.updateStatus('PAUSED')
    this.emit({
      type: 'discussion_paused',
      discussionId: this.session.id,
      status: 'PAUSED',
      timestamp: Date.now(),
    })
  }

  async resume(): Promise<void> {
    this.paused = false
    await this.updateStatus('RUNNING')
    this.emit({
      type: 'status_update',
      discussionId: this.session.id,
      status: 'RUNNING',
      timestamp: Date.now(),
    })
  }

  async stop(): Promise<void> {
    this.aborted = true
    await this.updateStatus('CANCELLED')
  }

  getMessages(): DiscussionMessage[] {
    return this.messages
  }

  isRunning(): boolean {
    return !this.aborted && !this.paused
  }

  isPaused(): boolean {
    return this.paused
  }

  // ── Parallel Mode ───────────────────────────────────────────────────────────

  private async runParallelMode(): Promise<void> {
    // In parallel mode, all participants respond simultaneously to the topic
    for (let round = 1; round <= this.config.maxRounds && !this.aborted && !this.paused; round++) {
      await this.updateCurrentRound(round)

      this.emit({
        type: 'round_start',
        discussionId: this.session.id,
        roundIndex: round,
        timestamp: Date.now(),
      })

      // All participants respond at the same time (concurrent)
      const participants = getSpeakOrder('parallel', round, this.session.participants)

      await Promise.all(
        participants.map(p => this.runParticipantTurn(p, round, 1))
      )

      this.emit({
        type: 'round_done',
        discussionId: this.session.id,
        roundIndex: round,
        timestamp: Date.now(),
      })

      // Check for consensus (optional)
      if (this.config.enableConsensusDetection) {
        const consensus = await this.detectConsensus()
        if (consensus) {
          this.emit({
            type: 'consensus_detected',
            discussionId: this.session.id,
            summary: consensus,
            timestamp: Date.now(),
          })
          break
        }
      }
    }
  }

  // ── Round-Robin Mode ────────────────────────────────────────────────────────

  private async runRoundRobinMode(): Promise<void> {
    for (let round = 1; round <= this.config.maxRounds && !this.aborted && !this.paused; round++) {
      await this.updateCurrentRound(round)

      this.emit({
        type: 'round_start',
        discussionId: this.session.id,
        roundIndex: round,
        timestamp: Date.now(),
      })

      const participants = getSpeakOrder('round-robin', round, this.session.participants)

      for (let turn = 1; turn <= participants.length && !this.aborted && !this.paused; turn++) {
        const participant = participants[turn - 1]

        this.emit({
          type: 'turn_start',
          discussionId: this.session.id,
          roundIndex: round,
          turnIndex: turn,
          participantId: participant.id,
          agentId: participant.agentId,
          agentName: participant.agentName,
          timestamp: Date.now(),
        })

        await this.runParticipantTurn(participant, round, turn)

        this.emit({
          type: 'turn_done',
          discussionId: this.session.id,
          roundIndex: round,
          turnIndex: turn,
          participantId: participant.id,
          agentId: participant.agentId,
          timestamp: Date.now(),
        })
      }

      this.emit({
        type: 'round_done',
        discussionId: this.session.id,
        roundIndex: round,
        timestamp: Date.now(),
      })

      // Optional reflection between rounds
      if (this.config.enableReflection && round < this.config.maxRounds) {
        await this.runReflectionRound(round)
      }
    }
  }

  // ── Debate Mode ─────────────────────────────────────────────────────────────

  private async runDebateMode(): Promise<void> {
    // Debate: alternate between pro and con sides
    for (let round = 1; round <= this.config.maxRounds && !this.aborted && !this.paused; round++) {
      await this.updateCurrentRound(round)

      this.emit({
        type: 'round_start',
        discussionId: this.session.id,
        roundIndex: round,
        timestamp: Date.now(),
      })

      const participants = getSpeakOrder('debate', round, this.session.participants)

      for (let turn = 1; turn <= participants.length && !this.aborted && !this.paused; turn++) {
        const participant = participants[turn - 1]

        this.emit({
          type: 'turn_start',
          discussionId: this.session.id,
          roundIndex: round,
          turnIndex: turn,
          participantId: participant.id,
          agentId: participant.agentId,
          agentName: participant.agentName,
          timestamp: Date.now(),
        })

        await this.runParticipantTurn(participant, round, turn)

        this.emit({
          type: 'turn_done',
          discussionId: this.session.id,
          roundIndex: round,
          turnIndex: turn,
          participantId: participant.id,
          agentId: participant.agentId,
          timestamp: Date.now(),
        })
      }

      this.emit({
        type: 'round_done',
        discussionId: this.session.id,
        roundIndex: round,
        timestamp: Date.now(),
      })
    }
  }

  // ── Run Single Participant Turn ─────────────────────────────────────────────

  private async runParticipantTurn(
    participant: DiscussionSession['participants'][0],
    roundIndex: number,
    turnIndex: number
  ): Promise<void> {
    const startTime = Date.now()
    const messageId = crypto.randomUUID()

    // Emit message_start
    this.emit({
      type: 'message_start',
      discussionId: this.session.id,
      roundIndex,
      turnIndex,
      participantId: participant.id,
      agentId: participant.agentId,
      agentName: participant.agentName,
      timestamp: startTime,
    })

    try {
      const ctx = buildLLMContext(
        participant,
        this.session,
        roundIndex,
        turnIndex,
        this.messages
      )

      const content = await this.callLLM(ctx, (delta) => {
        this.emit({
          type: 'message_delta',
          discussionId: this.session.id,
          roundIndex,
          turnIndex,
          participantId: participant.id,
          agentId: participant.agentId,
          agentName: participant.agentName,
          content: delta,
          done: false,
          timestamp: Date.now(),
        })
      })

      const latencyMs = Date.now() - startTime

      const message: DiscussionMessage = {
        id: messageId,
        discussionId: this.session.id,
        participantId: participant.id,
        agentId: participant.agentId,
        agentName: participant.agentName,
        roundIndex,
        turnIndex,
        content,
        role: participant.isModerator ? 'moderator' : 'participant',
        isStreaming: false,
        latencyMs,
        createdAt: new Date(),
      }

      this.messages.push(message)

      // Save to DB
      await this.saveMessage(message)

      this.emit({
        type: 'message_done',
        discussionId: this.session.id,
        roundIndex,
        turnIndex,
        participantId: participant.id,
        agentId: participant.agentId,
        agentName: participant.agentName,
        content,
        done: true,
        timestamp: Date.now(),
      })
    } catch (err: any) {
      this.emit({
        type: 'message_delta',
        discussionId: this.session.id,
        roundIndex,
        turnIndex,
        participantId: participant.id,
        agentId: participant.agentId,
        agentName: participant.agentName,
        content: `\n[错误: ${err.message}]`,
        done: false,
        error: err.message,
        timestamp: Date.now(),
      })

      this.emit({
        type: 'message_done',
        discussionId: this.session.id,
        roundIndex,
        turnIndex,
        participantId: participant.id,
        agentId: participant.agentId,
        agentName: participant.agentName,
        content: `[错误: ${err.message}]`,
        done: true,
        error: err.message,
        timestamp: Date.now(),
      })
    }
  }

  // ── Call LLM via Gateway ─────────────────────────────────────────────────────

  private async callLLM(
    ctx: ParticipantLLMContext,
    onDelta: (delta: string) => void
  ): Promise<string> {
    const { participant, topic, mode } = ctx

    // Get adapter and model
    const modelId = participant.config.modelId || 'gpt-4o'

    const adapter = createAdapter(modelId)
    if (!adapter) {
      throw new Error(`No adapter for model ${modelId}`)
    }

    const apiModel = getApiModelName(modelId)

    // Build messages
    const systemMsg: LLMMessage = {
      role: 'system',
      content: ctx.systemPrompt,
    }

    const userMsg: LLMMessage = {
      role: 'user',
      content: `请针对以下话题给出你的分析和观点：\n\n"${topic}"`,
    }

    let fullContent = ''

    for await (const chunk of adapter.chatStream!({
      model: apiModel,
      messages: [systemMsg, userMsg],
      temperature: participant.config.temperature ?? 0.7,
      maxTokens: 2048,
    })) {
      fullContent += chunk.content
      if (onDelta && chunk.content) {
        onDelta(chunk.content)
      }
    }

    return fullContent
  }

  // ── Reflection Round ────────────────────────────────────────────────────────

  private async runReflectionRound(roundIndex: number): Promise<void> {
    // Insert a system-level reflection message
    const reflectionMessage: DiscussionMessage = {
      id: crypto.randomUUID(),
      discussionId: this.session.id,
      participantId: 'system',
      agentId: 'system',
      agentName: '系统',
      roundIndex,
      turnIndex: 0,
      content: '【反思】以上各位的观点已经表达。请各位在下一轮中相互回应，并深化讨论。',
      role: 'system',
      isStreaming: false,
      createdAt: new Date(),
    }
    this.messages.push(reflectionMessage)
    await this.saveMessage(reflectionMessage)
  }

  // ── Consensus Detection ─────────────────────────────────────────────────────

  private async detectConsensus(): Promise<string | null> {
    // Simple heuristic: if all participants' latest messages
    // contain similar positive sentiment keywords, suggest consensus
    const recentMessages = this.messages.slice(-this.session.participants.length)
    if (recentMessages.length < 2) return null

    const texts = recentMessages.map(m => m.content.toLowerCase())
    const consensusKeywords = ['同意', '支持', '达成', '共识', 'agree', 'consensus']

    const found = texts.filter(t =>
      consensusKeywords.some(k => t.includes(k))
    )

    if (found.length >= texts.length * 0.7) {
      return '检测到多数参与者表示支持，可能已达成共识。'
    }
    return null
  }

  // ── Finalize Discussion ─────────────────────────────────────────────────────

  private async finalize(): Promise<void> {
    let decisionText: string | undefined

    if (this.config.enableSummary) {
      const summary = await generateSummary(this.session, this.messages)
      decisionText = summary.finalDecision
      await saveSummary(this.session.id, summary)
    } else {
      const lastMessages: string[] = []
      for (const p of this.session.participants) {
        const last = [...this.messages]
          .reverse()
          .find(m => m.agentId === p.agentId)
        if (last) {
          lastMessages.push(`【${p.agentName}】: ${last.content.substring(0, 200)}`)
        }
      }
      decisionText = lastMessages.join('\n\n')
    }

    await prisma.discussionSession.update({
      where: { id: this.session.id },
      data: {
        status: 'COMPLETED',
        ...(!this.config.enableSummary
          ? {
              finalSummary: null,
              finalDecision: decisionText ?? null,
            }
          : {}),
      },
    })
    this.session.status = 'COMPLETED'

    this.emit({
      type: 'discussion_done',
      discussionId: this.session.id,
      summary: decisionText,
      decision: decisionText,
      timestamp: Date.now(),
    })
  }

  // ── DB Helpers ──────────────────────────────────────────────────────────────

  private async updateStatus(status: DiscussionSession['status']): Promise<void> {
    this.session.status = status
    await prisma.discussionSession.update({
      where: { id: this.session.id },
      data: { status },
    })
  }

  private async updateCurrentRound(round: number): Promise<void> {
    this.session.currentRound = round
    await prisma.discussionSession.update({
      where: { id: this.session.id },
      data: { currentRound: round },
    })
  }

  private async saveMessage(message: DiscussionMessage): Promise<void> {
    try {
      await prisma.conversationMessage.create({
        data: {
          id: message.id,
          sessionId: this.session.conversationId,
          role: message.role,
          content: message.content,
          agentId: message.agentId,
          roundIndex: message.roundIndex,
          turnIndex: message.turnIndex,
          metadata: JSON.stringify({
            discussionId: this.session.id,
            participantId: message.participantId,
            agentName: message.agentName,
            latencyMs: message.latencyMs,
          }),
        } as any,
      })
    } catch (err) {
      console.error('[DiscussionRuntime] Failed to save message:', err)
    }
  }

  // ── Emit Helper ─────────────────────────────────────────────────────────────

  private emit(event: DiscussionSSEEvent): void {
    try {
      this.emitter(event)
    } catch {}
  }
}

// ── Adapter Factory (duplicate from chat.ts — refactor to shared later) ─────────

import { OpenAIAdapter } from '../llm-gateway/adapters/openai.adapter'
import { ClaudeAdapter } from '../llm-gateway/adapters/claude.adapter'
import { GoogleAdapter } from '../llm-gateway/adapters/google.adapter'
import { DeepSeekAdapter } from '../llm-gateway/adapters/deepseek.adapter'
import { DashScopeAdapter } from '../llm-gateway/adapters/dashscope.adapter'
import { GLMAdapter } from '../llm-gateway/adapters/glm.adapter'
import { MiniMaxAdapter } from '../llm-gateway/adapters/minimax.adapter'
import { OllamaAdapter } from '../llm-gateway/adapters/ollama.adapter'
import { AVAILABLE_MODELS } from '../llm-gateway/types'

const OPENAI_API_KEY    = process.env.OPENAI_API_KEY || ''
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''
const GOOGLE_API_KEY    = process.env.GOOGLE_API_KEY || ''
const DEEPSEEK_API_KEY  = process.env.DEEPSEEK_API_KEY || ''
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || ''
const GLM_API_KEY       = process.env.GLM_API_KEY || ''
const MINIMAX_API_KEY   = process.env.MINIMAX_API_KEY || ''
const MINIMAX_GROUP_ID  = process.env.MINIMAX_GROUP_ID || ''
const OLLAMA_BASE_URL   = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
const OLLAMA_API_KEY    = process.env.OLLAMA_API_KEY || ''

function createAdapter(modelId: string) {
  if (modelId.startsWith('gpt-') || modelId.startsWith('o')) {
    return new OpenAIAdapter(OPENAI_API_KEY)
  }
  if (modelId.startsWith('claude-')) {
    return new ClaudeAdapter(ANTHROPIC_API_KEY)
  }
  if (modelId.startsWith('gemini-')) {
    return new GoogleAdapter(GOOGLE_API_KEY)
  }
  if (modelId.startsWith('deepseek-')) {
    return new DeepSeekAdapter(DEEPSEEK_API_KEY)
  }
  if (modelId.startsWith('qwen-') || modelId.startsWith('qwq-')) {
    return new DashScopeAdapter(DASHSCOPE_API_KEY)
  }
  if (modelId.startsWith('glm-')) {
    return new GLMAdapter(GLM_API_KEY)
  }
  if (modelId.startsWith('minimax-') || modelId === 'abab6.5-chat') {
    return new MiniMaxAdapter(MINIMAX_API_KEY, MINIMAX_GROUP_ID)
  }
  if (modelId.includes(':')) {
    return new OllamaAdapter(OLLAMA_BASE_URL, OLLAMA_API_KEY)
  }
  return null
}

function getApiModelName(modelId: string): string {
  return AVAILABLE_MODELS.find(m => m.id === modelId)?.apiName ?? modelId
}
