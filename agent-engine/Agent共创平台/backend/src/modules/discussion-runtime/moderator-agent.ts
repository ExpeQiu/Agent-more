/**
 * Moderator Agent — Discussion Facilitator
 *
 * Role: Neutral facilitator who guides the discussion without taking sides.
 *
 * Responsibilities:
 * - Introduce topic and set ground rules
 * - Ask probing questions to specific participants
 * - Summarize progress at key points
 * - Identify disagreements and prompt debate
 * - Guide transitions between stages
 * - Keep discussion on track
 * - Trigger reflection and consensus checks
 */

import type {
  DiscussionParticipant,
  DiscussionMessage,
  ModeratorAction,
  ModeratorConfig,
  DiscussionSession,
  DebateStage,
} from './types'
import type { LLMMessage } from '../llm-gateway/types'

// ── Default Config ─────────────────────────────────────────────────────────────

export const DEFAULT_MODERATOR_CONFIG: ModeratorConfig = {
  introductionEnabled: true,
  questionEnabled: true,
  transitionEnabled: true,
  challengeEnabled: true,
  summarizeInterval: 2,
  auto引导: true,
}

// ── Moderator Prompt Templates ──────────────────────────────────────────────────

const MODERATOR_SYSTEM_PROMPT = `你是一位中立、专业、经验丰富的辩论主持人。

你的职责：
1. 公正无私，不偏袒任何一方
2. 引导讨论深入，而非简单罗列观点
3. 提出尖锐但公平的问题
4. 适时总结和过渡
5. 维持讨论秩序和效率

你的风格：
- 语言简洁、专业
- 问题有深度，能激发思考
- 总结精准，突出关键分歧
- 过渡自然流畅

【重要】你只能发言和提问，不能表达自己的观点或站队。`

// ── Moderator Agent Class ───────────────────────────────────────────────────────

export class ModeratorAgent {
  private config: ModeratorConfig
  private agentId: string
  private agentName: string

  constructor(
    agentId: string,
    agentName: string = '主持人',
    config: Partial<ModeratorConfig> = {}
  ) {
    this.config = { ...DEFAULT_MODERATOR_CONFIG, ...config }
    this.agentId = agentId
    this.agentName = agentName
  }

  /**
   * Generate introduction message
   */
  generateIntroduction(topic: string, participants: DiscussionParticipant[]): ModeratorAction {
    const participantNames = participants.map(p => p.agentName).join('、')

    const content = `各位好，欢迎参加本次讨论。

**辩题：** "${topic}"

**参与者：** ${participantNames}

**规则说明：**
1. 请各位清晰表达自己的观点
2. 尊重他人，认真倾听
3. 有理有据，逻辑清晰
4. 欢迎提出质疑和反驳

让我们开始今天的讨论。`

    return this.createAction('introduce', content, 0, 0)
  }

  /**
   * Generate question to a specific participant
   */
  generateQuestion(
    participant: DiscussionParticipant,
    topic: string,
    roundIndex: number,
    turnIndex: number,
    previousMessages: DiscussionMessage[]
  ): ModeratorAction {
    // Analyze recent messages to generate targeted question
    const recentContent = previousMessages.slice(-5).map(m => m.content).join('\n')

    const questionPrompt = `基于以下讨论内容，请生成一个针对 ${participant.agentName} 的追问：

最近发言：
${recentContent}

请生成一个尖锐但公平的问题，要求 ${participant.agentName} 进一步阐明或回应。

要求：
- 问题要具体，不要泛泛而谈
- 可以质疑其论点的某个方面
- 也可以要求其提供更多证据或细节
- 控制在50字以内`

    // For now, generate a simple probing question based on the topic
    const questions = [
      `请问${participant.agentName}，您如何回应对方关于"${topic}"的质疑？`,
      `能否详细说明您的第${previousMessages.length + 1}个论点的具体依据？`,
      `请问${participant.agentName}，您认为对方观点中最值得商榷的是什么？`,
    ]

    const content = questions[Math.floor(Math.random() * questions.length)]

    return this.createAction('question', content, roundIndex, turnIndex, participant.id)
  }

  /**
   * Generate transition message between stages
   */
  generateTransition(
    fromStage: DebateStage | string,
    toStage: DebateStage | string,
    roundIndex: number,
    turnIndex: number
  ): ModeratorAction {
    const stageNames: Record<string, string> = {
      opening: '开场陈述',
      rebuttal: '反驳环节',
      counter: '再反驳环节',
      closing: '总结陈词',
      adjudication: '裁判评分',
    }

    const fromName = stageNames[fromStage] || fromStage
    const toName = stageNames[toStage] || toStage

    const transitions: Record<string, string> = {
      'opening->rebuttal': `感谢双方的开场陈述。现在进入反驳环节，请双方针对对方刚才的论点进行有力反驳。`,
      'rebuttal->counter': `反驳环节结束。现在进入再反驳环节，请双方进一步回应对方的质疑。`,
      'counter->closing': `再反驳环节结束。现在进入最终总结环节，请双方做总结陈述。`,
      'opening->closing': `感谢各位的发言。现在进入最终总结环节。`,
    }

    const key = `${fromStage}->${toStage}`
    const content = transitions[key] || `${fromName}结束，进入${toName}。`

    return this.createAction('transition', content, roundIndex, turnIndex)
  }

  /**
   * Generate summary of current discussion state
   */
  generateSummary(
    participants: DiscussionParticipant[],
    messages: DiscussionMessage[],
    roundIndex: number,
    turnIndex: number
  ): ModeratorAction {
    const lastMessages = messages.slice(-Math.min(messages.length, 10))

    // Build summary content
    const participantViews = new Map<string, string[]>()
    for (const msg of lastMessages) {
      if (!participantViews.has(msg.participantId)) {
        participantViews.set(msg.participantId, [])
      }
      participantViews.get(msg.participantId)!.push(msg.content.substring(0, 100))
    }

    const summaries: string[] = []
    for (const [participantId, contents] of participantViews) {
      const participant = participants.find(p => p.id === participantId)
      if (participant) {
        summaries.push(`【${participant.agentName}】${contents[0]}...`)
      }
    }

    const content = `**本轮小结：**

${summaries.join('\n')}

请各位继续围绕核心问题深入讨论。`

    return this.createAction('summarize', content, roundIndex, turnIndex)
  }

  /**
   * Generate challenge to stimulate debate
   */
  generateChallenge(
    participant: DiscussionParticipant,
    topic: string,
    roundIndex: number,
    turnIndex: number
  ): ModeratorAction {
    const challenges = [
      `请问${participant.agentName}，如果对手认为${topic}的关键在于成本，您如何回应？`,
      `${participant.agentName}提到观点很有趣，但请问您如何解释其中的矛盾？`,
      `请问${participant.agentName}能否用更具体的例子来说明您的观点？`,
    ]

    const content = challenges[Math.floor(Math.random() * challenges.length)]

    return this.createAction('challenge', content, roundIndex, turnIndex, participant.id)
  }

  /**
   * Generate redirect when discussion goes off-topic
   */
  generateRedirect(
    originalTopic: string,
    roundIndex: number,
    turnIndex: number
  ): ModeratorAction {
    const content = `感谢各位的讨论。不过我们需要回到核心问题：

**辩题：** "${originalTopic}"

请各位围绕这个主题继续发表观点。`

    return this.createAction('redirect', content, roundIndex, turnIndex)
  }

  /**
   * Generate closing message
   */
  generateClosing(
    topic: string,
    participants: DiscussionParticipant[],
    messages: DiscussionMessage[]
  ): ModeratorAction {
    const proMessages = messages.filter(m => {
      const p = participants.find(pp => pp.id === m.participantId)
      return p?.stance === 'pro'
    })
    const conMessages = messages.filter(m => {
      const p = participants.find(pp => pp.id === m.participantId)
      return p?.stance === 'con'
    })

    const content = `感谢各位的精彩发言。

**讨论总结：**
- 正方（${proMessages.length}次发言）：主要围绕${proMessages[0]?.content.substring(0, 50) || '核心论点'}等观点展开
- 反方（${conMessages.length}次发言）：主要围绕${conMessages[0]?.content.substring(0, 50) || '核心论点'}等观点展开

**最终结论：** 请各位做出最终陈述。

感谢参与！`

    return this.createAction('transition', content, Number.MAX_SAFE_INTEGER, 0)
  }

  /**
   * Build LLM prompt for moderator actions
   */
  buildModeratorPrompt(actionType: string, context: Record<string, any>): string {
    switch (actionType) {
      case 'introduce':
        return `请生成开场白，介绍辩题和参与者。`
      case 'question':
        return `请针对 ${context.participantName} 生成一个追问，问题要具体尖锐。`
      case 'summarize':
        return `请总结目前的讨论进展，突出关键分歧。`
      case 'transition':
        return `请生成过渡语，引导讨论进入下一阶段。`
      case 'challenge':
        return `请生成挑战性问题，激发 ${context.participantName} 深入思考。`
      case 'redirect':
        return `请温和但坚定地将讨论引导回核心主题。`
      default:
        return `请继续主持讨论。`
    }
  }

  /**
   * Build system prompt for LLM call
   */
  buildSystemPrompt(): string {
    return MODERATOR_SYSTEM_PROMPT
  }

  /**
   * Build user prompt for LLM call
   */
  buildUserPrompt(topic: string, participants: DiscussionParticipant[], context: string): string {
    const participantList = participants.map(p =>
      `- ${p.agentName} (${p.stance || '中立'})`
    ).join('\n')

    return `**辩题：** ${topic}

**参与者：**
${participantList}

**当前情境：**
${context}

请生成符合主持人角色的发言。`
  }

  // ── Helper Methods ────────────────────────────────────────────────────────────

  private createAction(
    actionType: ModeratorAction['actionType'],
    content: string,
    roundIndex: number,
    turnIndex: number,
    targetParticipantId?: string
  ): ModeratorAction {
    return {
      actionId: crypto.randomUUID(),
      discussionId: '', // Will be set by caller
      actionType,
      targetParticipantId,
      content,
      roundIndex,
      turnIndex,
      createdAt: new Date(),
    }
  }

  getAgentId(): string {
    return this.agentId
  }

  getAgentName(): string {
    return this.agentName
  }
}

// ── Moderator Manager ───────────────────────────────────────────────────────────

export class ModeratorManager {
  private moderator: ModeratorAgent
  private session: DiscussionSession
  private actionHistory: ModeratorAction[] = []

  constructor(
    session: DiscussionSession,
    agentId: string,
    agentName?: string,
    config?: Partial<ModeratorConfig>
  ) {
    this.moderator = new ModeratorAgent(agentId, agentName, config)
    this.session = session
  }

  /**
   * Get initial introduction action
   */
  getIntroduction(): ModeratorAction {
    const action = this.moderator.generateIntroduction(
      this.session.topic,
      this.session.participants
    )
    action.discussionId = this.session.id
    this.actionHistory.push(action)
    return action
  }

  /**
   * Decide if moderator should intervene
   */
  shouldIntervene(
    roundIndex: number,
    messagesSinceLastIntervention: number
  ): boolean {
    // Intervene every summarizeInterval rounds or if there are many new messages
    if (roundIndex > 0 && roundIndex % this.moderator['config'].summarizeInterval === 0) {
      return true
    }
    if (messagesSinceLastIntervention >= 4) {
      return true
    }
    return false
  }

  /**
   * Get appropriate moderator action based on context
   */
  getIntervention(
    roundIndex: number,
    turnIndex: number,
    messages: DiscussionMessage[]
  ): ModeratorAction | null {
    const lastAction = this.actionHistory[this.actionHistory.length - 1]
    const messagesSinceLastIntervention = lastAction
      ? messages.filter(m => m.createdAt > lastAction.createdAt).length
      : messages.length

    // Need to generate appropriate intervention
    if (messagesSinceLastIntervention >= 4 && this.moderator['config'].summarizeInterval > 0) {
      const action = this.moderator.generateSummary(
        this.session.participants,
        messages,
        roundIndex,
        turnIndex
      )
      action.discussionId = this.session.id
      this.actionHistory.push(action)
      return action
    }

    return null
  }

  /**
   * Get stage transition
   */
  getTransition(fromStage: DebateStage | string, toStage: DebateStage | string): ModeratorAction {
    const action = this.moderator.generateTransition(fromStage, toStage, 0, 0)
    action.discussionId = this.session.id
    this.actionHistory.push(action)
    return action
  }

  /**
   * Get question to specific participant
   */
  getQuestion(
    participant: DiscussionParticipant,
    roundIndex: number,
    turnIndex: number,
    previousMessages: DiscussionMessage[]
  ): ModeratorAction {
    const action = this.moderator.generateQuestion(
      participant,
      this.session.topic,
      roundIndex,
      turnIndex,
      previousMessages
    )
    action.discussionId = this.session.id
    this.actionHistory.push(action)
    return action
  }

  /**
   * Get closing message
   */
  getClosing(messages: DiscussionMessage[]): ModeratorAction {
    const action = this.moderator.generateClosing(
      this.session.topic,
      this.session.participants,
      messages
    )
    action.discussionId = this.session.id
    this.actionHistory.push(action)
    return action
  }

  getHistory(): ModeratorAction[] {
    return this.actionHistory
  }
}
