/**
 * Discussion Runtime — Summarizer
 * Phase 3: Multi-Agent Discussion Module
 *
 * Generates structured summary from discussion messages.
 */

import type { DiscussionMessage, DiscussionSession, DiscussionSummary } from './types'
import prisma from '../../config/database'

// ── Generate Summary ────────────────────────────────────────────────────────────

export async function generateSummary(
  session: DiscussionSession,
  messages: DiscussionMessage[]
): Promise<DiscussionSummary> {
  const participantIds = [...new Set(messages.map(m => m.agentId))]
  const totalRounds = Math.max(...messages.map(m => m.roundIndex), 1)

  // Group messages by participant
  const contributionsByAgent: Record<string, string[]> = {}
  for (const msg of messages) {
    if (!contributionsByAgent[msg.agentId]) {
      contributionsByAgent[msg.agentId] = []
    }
    if (msg.content && msg.content.trim().length > 0) {
      contributionsByAgent[msg.agentId].push(msg.content)
    }
  }

  // Build participant contributions summary
  const participantContributions: Record<string, string> = {}
  for (const [agentId, contents] of Object.entries(contributionsByAgent)) {
    const participant = session.participants.find(p => p.agentId === agentId)
    const agentName = participant?.agentName || agentId
    // Use first message content as the main contribution (or a truncated summary)
    const mainContent = contents[0] || ''
    participantContributions[agentId] = mainContent.length > 300
      ? mainContent.substring(0, 300) + '...'
      : mainContent
  }

  // Extract key points (simple heuristic: first sentence of each distinct message)
  const keyPoints = extractKeyPoints(messages)

  // Detect agreements and disagreements (simple keyword-based)
  const { agreements, disagreements } = detectAgreementsAndDisagreements(messages)

  // Generate final decision (synthesize from all messages)
  const finalDecision = synthesizeDecision(session, messages)

  return {
    discussionId: session.id,
    topic: session.topic,
    mode: session.mode,
    totalRounds,
    totalMessages: messages.filter(m => m.role === 'participant').length,
    keyPoints,
    agreements,
    disagreements,
    finalDecision,
    participantContributions,
    generatedAt: new Date(),
  }
}

// ── Helper: Extract Key Points ─────────────────────────────────────────────────

function extractKeyPoints(messages: DiscussionMessage[]): string[] {
  const points: string[] = []
  const seen = new Set<string>()

  for (const msg of messages) {
    if (!msg.content || msg.content.trim().length === 0) continue
    const content = msg.content.trim()

    // Try to extract the first significant sentence (at least 10 chars, not a question)
    const sentences = content.split(/[。！？.!?\n]/).filter(s => s.trim().length > 10)
    if (sentences.length > 0) {
      const first = sentences[0].trim()
      // Deduplicate by first 50 chars
      const key = first.substring(0, 50).toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        points.push(first)
      }
    }

    if (points.length >= 5) break // Cap at 5 key points
  }

  return points
}

// ── Helper: Detect Agreements / Disagreements ──────────────────────────────────

function detectAgreementsAndDisagreements(messages: DiscussionMessage[]): {
  agreements: string[]
  disagreements: string[]
} {
  const agreements: string[] = []
  const disagreements: string[] = []

  const contentTexts = messages
    .filter(m => m.content && m.content.trim().length > 20)
    .map(m => m.content.toLowerCase())

  // Simple keyword-based detection
  const agreeKeywords = ['同意', '支持', '赞成', '确实', '的确', 'agree', 'support', 'yes']
  const disagreeKeywords = ['反对', '不同意', '质疑', '不对', '但是', '然而', 'disagree', 'object', 'however', 'but']

  const agreeCount = contentTexts.filter(t =>
    agreeKeywords.some(k => t.includes(k))
  ).length

  const disagreeCount = contentTexts.filter(t =>
    disagreeKeywords.some(k => t.includes(k))
  ).length

  if (agreeCount > 0) {
    agreements.push(`共有 ${agreeCount} 条支持性发言`)
  }
  if (disagreeCount > 0) {
    disagreements.push(`共有 ${disagreeCount} 条质疑或反对意见`)
  }

  return { agreements, disagreements }
}

// ── Helper: Synthesize Final Decision ────────────────────────────────────────

function synthesizeDecision(session: DiscussionSession, messages: DiscussionMessage[]): string {
  if (messages.length === 0) {
    return '讨论未产生明确结论。'
  }

  // For debate mode, look for explicit voting/conclusion language
  if (session.mode === 'debate') {
    const allText = messages.map(m => m.content).join('\n')

    // Look for conclusion patterns
    if (allText.includes('结论') || allText.includes('最终') || allText.includes('综上')) {
      // Try to extract conclusion from last few messages
      const lastMessages = messages.slice(-3)
      for (const msg of lastMessages.reverse()) {
        if (msg.content.includes('结论') || msg.content.includes('最终')) {
          return msg.content.substring(0, 500)
        }
      }
    }
  }

  // Fallback: use last message as synthesis
  const lastContent = messages[messages.length - 1]?.content
  if (lastContent) {
    return `综合讨论结果：${lastContent.substring(0, 300)}${lastContent.length > 300 ? '...' : ''}`
  }

  return '讨论已完成，但未能形成明确结论。'
}

// ── Save Summary to DB ─────────────────────────────────────────────────────────

export async function saveSummary(
  discussionId: string,
  summary: DiscussionSummary
): Promise<void> {
  if (summary.discussionId !== discussionId) {
    console.warn('[DiscussionSummarizer] saveSummary: discussionId 与 summary 不一致', {
      discussionId,
      summaryDiscussionId: summary.discussionId,
    })
  }
  try {
    await prisma.discussionSession.update({
      where: { id: discussionId },
      data: {
        finalSummary: JSON.stringify(summary),
        finalDecision: summary.finalDecision ?? null,
      },
    })
  } catch (err) {
    console.error('[DiscussionSummarizer] saveSummary 写入失败', { discussionId, err })
    throw err
  }
}
