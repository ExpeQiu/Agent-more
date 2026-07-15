/**
 * ConsensusIndicator — Real-time Consensus Progress
 * Phase 4: Enhanced Discussion Module
 *
 * Shows:
 * - Overall consensus progress bar
 * - Participant view similarity heatmap
 * - Key agreements/disagreements
 * - Consensus status badge
 */

import React, { useState, useEffect } from 'react'

interface ConsensusData {
  progress: number // 0.0 - 1.0
  agreementLevel: number
  consensusType?: 'full' | 'partial' | 'tentative'
  agreeingParticipants: string[]
  keyAgreements: string[]
  detectedAt: Date
}

interface ConsensusIndicatorProps {
  participants: Array<{
    id: string
    agentName: string
    agentColor: string
  }>
  messages: Array<{
    participantId: string
    content: string
  }>
  consensusProgress?: number // From SSE event
  onConsensusReached?: () => void
}

export const ConsensusIndicator: React.FC<ConsensusIndicatorProps> = ({
  participants,
  messages,
  consensusProgress,
  onConsensusReached,
}) => {
  const [consensusData, setConsensusData] = useState<ConsensusData | null>(null)
  const [similarityMatrix, setSimilarityMatrix] = useState<number[][]>([])

  // Calculate consensus progress based on messages
  useEffect(() => {
    if (messages.length < 2) return

    // Simple heuristic: calculate agreement based on shared keywords
    const recentMessages = messages.slice(-10)
    const texts = recentMessages.map(m => m.content.toLowerCase())

    // Calculate pairwise similarity
    const matrix: number[][] = []
    for (let i = 0; i < texts.length; i++) {
      const row: number[] = []
      for (let j = 0; j < texts.length; j++) {
        if (i === j) {
          row.push(1)
        } else {
          row.push(calculateSimilarity(texts[i], texts[j]))
        }
      }
      matrix.push(row)
    }
    setSimilarityMatrix(matrix)

    // Calculate overall progress
    const avgSimilarity = matrix.flat().reduce((a, b) => a + b, 0) / (matrix.length * matrix.length)
    const progress = Math.min(avgSimilarity * 1.2, 1) // Scale up a bit

    // Detect agreements
    const keywords = ['同意', '支持', '共识', '的确', '没错', '确实']
    const recentTexts = texts.slice(-5).join(' ')
    const agreementCount = keywords.filter(k => recentTexts.includes(k)).length
    const agreementLevel = Math.min(agreementCount / 3, 1)

    setConsensusData({
      progress: consensusProgress || progress,
      agreementLevel,
      consensusType: progress > 0.8 ? 'full' : progress > 0.5 ? 'partial' : 'tentative',
      agreeingParticipants: [],
      keyAgreements: agreementCount > 0
        ? keywords.filter(k => recentTexts.includes(k)).map(k => `"${k}"`)
        : [],
      detectedAt: new Date(),
    })

    if (progress > 0.8 && onConsensusReached) {
      onConsensusReached()
    }
  }, [messages, consensusProgress])

  // Simple similarity calculation based on word overlap
  function calculateSimilarity(text1: string, text2: string): number {
    const words1 = new Set(extractWords(text1))
    const words2 = new Set(extractWords(text2))

    if (words1.size === 0 || words2.size === 0) return 0

    const intersection = new Set([...words1].filter(x => words2.has(x)))
    const union = new Set([...words1, ...words2])

    return intersection.size / union.size
  }

  function extractWords(text: string): string[] {
    return text
      .replace(/[^\w\s\u4e00-\u9fff]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2)
  }

  const progress = consensusData?.progress || 0
  const progressPercent = Math.round(progress * 100)

  return (
    <div className="bg-white rounded-lg border p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-800 flex items-center gap-2">
          <span className="text-lg">🤝</span>
          共识进度
        </h3>
        {consensusData && (
          <StatusBadge type={consensusData.consensusType || 'tentative'} />
        )}
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">整体共识</span>
          <span className="font-medium">{progressPercent}%</span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 rounded-full ${
              progress > 0.8
                ? 'bg-green-500'
                : progress > 0.5
                ? 'bg-yellow-500'
                : 'bg-blue-500'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Key Agreements */}
      {consensusData && consensusData.keyAgreements.length > 0 && (
        <div className="space-y-2">
          <span className="text-sm text-gray-600">检测到的共识点：</span>
          <div className="flex flex-wrap gap-1">
            {consensusData.keyAgreements.map((agreement, idx) => (
              <span
                key={idx}
                className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full"
              >
                {agreement}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Similarity Heatmap */}
      {similarityMatrix.length > 1 && (
        <div className="space-y-2">
          <span className="text-sm text-gray-600">参与者观点相似度</span>
          <div className="flex flex-col gap-1">
            {similarityMatrix.map((row, i) => (
              <div key={i} className="flex items-center gap-1">
                {/* Participant label */}
                <span className="text-xs w-16 truncate text-gray-500">
                  {participants[i % participants.length]?.agentName || `P${i + 1}`}
                </span>
                {/* Similarity cells */}
                <div className="flex gap-1">
                  {row.map((sim, j) => (
                    <div
                      key={j}
                      className="w-4 h-4 rounded-sm"
                      style={{
                        backgroundColor: `rgba(59, 130, 246, ${sim})`,
                      }}
                      title={`${sim.toFixed(2)}`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-end gap-1 text-xs text-gray-400">
            <span>0</span>
            <div className="w-16 h-2 bg-gradient-to-r from-white to-blue-500 rounded" />
            <span>1</span>
          </div>
        </div>
      )}

      {/* Agreement Level */}
      {consensusData && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">一致性水平</span>
          <span className="font-medium">
            {consensusData.agreementLevel > 0.7
              ? '🟢 高'
              : consensusData.agreementLevel > 0.4
              ? '🟡 中'
              : '🔴 低'}
          </span>
        </div>
      )}
    </div>
  )
}

// Status Badge Component
const StatusBadge: React.FC<{ type: 'full' | 'partial' | 'tentative' }> = ({ type }) => {
  const configs = {
    full: {
      label: '共识达成',
      className: 'bg-green-100 text-green-700',
    },
    partial: {
      label: '部分共识',
      className: 'bg-yellow-100 text-yellow-700',
    },
    tentative: {
      label: '初步讨论',
      className: 'bg-gray-100 text-gray-700',
    },
  }

  const config = configs[type]

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${config.className}`}>
      {config.label}
    </span>
  )
}

export default ConsensusIndicator
