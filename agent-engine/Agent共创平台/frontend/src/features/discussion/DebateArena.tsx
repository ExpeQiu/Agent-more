/**
 * DebateArena — Dedicated Debate UI
 * Phase 4: Enhanced Discussion Module
 *
 * Features:
 * - Split pro/con view
 * - Stage progression tracker
 * - Rebuttal timeline
 * - Adjudicator score cards
 * - Real-time debate visualization
 */

import React, { useState, useEffect, useMemo } from 'react'
import type { DiscussionMessage, DiscussionParticipant, SSEEvent } from './lib/discussion-service'
import { useDiscussionStore } from './lib/discussion-store'

interface DebateArenaProps {
  discussionId: string
  topic: string
  proParticipant: DiscussionParticipant
  conParticipant: DiscussionParticipant
  messages: DiscussionMessage[]
  onVoteStart?: () => void
}

type DebateStage = 'opening' | 'rebuttal' | 'counter' | 'closing' | 'adjudication'

const STAGE_ORDER: DebateStage[] = ['opening', 'rebuttal', 'counter', 'closing', 'adjudication']

const STAGE_LABELS: Record<DebateStage, string> = {
  opening: '开场陈述',
  rebuttal: '反驳',
  counter: '再反驳',
  closing: '总结陈词',
  adjudication: '裁判评分',
}

const STAGE_COLORS: Record<DebateStage, string> = {
  opening: 'bg-blue-100 border-blue-300',
  rebuttal: 'bg-orange-100 border-orange-300',
  counter: 'bg-red-100 border-red-300',
  closing: 'bg-purple-100 border-purple-300',
  adjudication: 'bg-yellow-100 border-yellow-300',
}

export const DebateArena: React.FC<DebateArenaProps> = ({
  discussionId,
  topic,
  proParticipant,
  conParticipant,
  messages,
  onVoteStart,
}) => {
  const [currentStage, setCurrentStage] = useState<DebateStage>('opening')
  const [scores, setScores] = useState<{
    pro: Record<string, number>
    con: Record<string, number>
  }>({
    pro: { logic: 0, evidence: 0, persuasion: 0, innovation: 0 },
    con: { logic: 0, evidence: 0, persuasion: 0, innovation: 0 },
  })

  // Group messages by participant and stage
  const groupedMessages = useMemo(() => {
    const proMessages = messages.filter(m => m.participantId === proParticipant.id)
    const conMessages = messages.filter(m => m.participantId === conParticipant.id)
    return { pro: proMessages, con: conMessages }
  }, [messages, proParticipant.id, conParticipant.id])

  // Detect current stage from messages
  useEffect(() => {
    if (messages.length === 0) return

    const lastMessage = messages[messages.length - 1]
    const turnIndex = lastMessage?.turnIndex || 1

    // Simple stage detection based on turn index
    if (turnIndex <= 2) {
      setCurrentStage('opening')
    } else if (turnIndex <= 4) {
      setCurrentStage('rebuttal')
    } else if (turnIndex <= 6) {
      setCurrentStage('counter')
    } else {
      setCurrentStage('closing')
    }
  }, [messages])

  // Stage progression bar
  const currentStageIndex = STAGE_ORDER.indexOf(currentStage)

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Topic Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-4">
        <div className="text-xs uppercase tracking-wide opacity-75 mb-1">辩题</div>
        <div className="text-lg font-medium">"{topic}"</div>
      </div>

      {/* Stage Progress */}
      <div className="bg-white border-b px-6 py-3">
        <div className="flex items-center justify-between">
          {STAGE_ORDER.map((stage, idx) => (
            <React.Fragment key={stage}>
              <div className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium border-2 transition-all ${
                    idx <= currentStageIndex
                      ? `${STAGE_COLORS[stage]} border-current text-gray-800`
                      : 'bg-gray-100 border-gray-300 text-gray-400'
                  }`}
                >
                  {idx + 1}
                </div>
                <span className={`text-sm hidden sm:block ${
                  idx <= currentStageIndex ? 'text-gray-800 font-medium' : 'text-gray-400'
                }`}>
                  {STAGE_LABELS[stage]}
                </span>
              </div>
              {idx < STAGE_ORDER.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 ${
                  idx < currentStageIndex ? 'bg-blue-400' : 'bg-gray-200'
                }`} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Main Debate Area */}
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full">
          {/* Pro Side */}
          <div className="flex flex-col">
            <div className="bg-green-50 border-2 border-green-200 rounded-t-lg px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: proParticipant.agentColor }}
                />
                <span className="font-medium text-green-800">{proParticipant.agentName}</span>
              </div>
              <span className="text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded">正方</span>
            </div>

            <div className="flex-1 bg-white border-x border-b border-green-200 rounded-b-lg p-4 overflow-auto space-y-3">
              {groupedMessages.pro.map((msg, idx) => (
                <div
                  key={msg.id || idx}
                  className={`p-3 rounded-lg ${
                    msg.role === 'moderator'
                      ? 'bg-yellow-50 border border-yellow-200'
                      : 'bg-green-50 border border-green-100'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500">
                      第{msg.roundIndex}轮 · 第{msg.turnIndex}次发言
                    </span>
                    {msg.isStreaming && (
                      <span className="text-xs text-blue-500 animate-pulse">输入中...</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">
                    {msg.content}
                    {msg.isStreaming && <span className="animate-pulse">▊</span>}
                  </p>
                </div>
              ))}

              {groupedMessages.pro.length === 0 && (
                <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                  等待正方发言...
                </div>
              )}
            </div>

            {/* Pro Score Card */}
            <ScoreCard
              label="正方评分"
              scores={scores.pro}
              colorClass="green"
            />
          </div>

          {/* Con Side */}
          <div className="flex flex-col">
            <div className="bg-red-50 border-2 border-red-200 rounded-t-lg px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: conParticipant.agentColor }}
                />
                <span className="font-medium text-red-800">{conParticipant.agentName}</span>
              </div>
              <span className="text-xs bg-red-200 text-red-800 px-2 py-0.5 rounded">反方</span>
            </div>

            <div className="flex-1 bg-white border-x border-b border-red-200 rounded-b-lg p-4 overflow-auto space-y-3">
              {groupedMessages.con.map((msg, idx) => (
                <div
                  key={msg.id || idx}
                  className={`p-3 rounded-lg ${
                    msg.role === 'moderator'
                      ? 'bg-yellow-50 border border-yellow-200'
                      : 'bg-red-50 border border-red-100'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500">
                      第{msg.roundIndex}轮 · 第{msg.turnIndex}次发言
                    </span>
                    {msg.isStreaming && (
                      <span className="text-xs text-blue-500 animate-pulse">输入中...</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">
                    {msg.content}
                    {msg.isStreaming && <span className="animate-pulse">▊</span>}
                  </p>
                </div>
              ))}

              {groupedMessages.con.length === 0 && (
                <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                  等待反方发言...
                </div>
              )}
            </div>

            {/* Con Score Card */}
            <ScoreCard
              label="反方评分"
              scores={scores.con}
              colorClass="red"
            />
          </div>
        </div>
      </div>

      {/* Bottom Actions */}
      {onVoteStart && currentStage === 'closing' && (
        <div className="bg-white border-t px-6 py-4 flex justify-center">
          <button
            onClick={onVoteStart}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            开始投票
          </button>
        </div>
      )}
    </div>
  )
}

// Score Card Component
interface ScoreCardProps {
  label: string
  scores: Record<string, number>
  colorClass: 'green' | 'red' | 'blue'
}

const ScoreCard: React.FC<ScoreCardProps> = ({ label, scores, colorClass }) => {
  const dimensions = ['logic', 'evidence', 'persuasion', 'innovation']
  const dimensionLabels: Record<string, string> = {
    logic: '逻辑性',
    evidence: '证据',
    persuasion: '说服力',
    innovation: '创新性',
  }

  const colorMap = {
    green: 'bg-green-500',
    red: 'bg-red-500',
    blue: 'bg-blue-500',
  }

  const avgScore = Object.values(scores).reduce((a, b) => a + b, 0) / Math.max(Object.values(scores).length, 1)

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 mt-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className={`text-lg font-bold ${colorClass === 'green' ? 'text-green-600' : colorClass === 'red' ? 'text-red-600' : 'text-blue-600'}`}>
          {avgScore.toFixed(1)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {dimensions.map(dim => (
          <div key={dim} className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-12">{dimensionLabels[dim]}</span>
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full ${colorMap[colorClass]} transition-all duration-300`}
                style={{ width: `${(scores[dim] / 10) * 100}%` }}
              />
            </div>
            <span className="text-xs font-medium w-6 text-right">{scores[dim].toFixed(1)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default DebateArena
