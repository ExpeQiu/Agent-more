/**
 * VotingPanel — Discussion Voting UI
 * Phase 4: Enhanced Discussion Module
 *
 * Features:
 * - Multiple voting types (approve-reject, rating)
 * - Anonymous/public voting
 * - Results visualization
 * - Vote submission status
 */

import React, { useState, useEffect } from 'react'
import { discussionService } from './lib/discussion-service'
import { buildApiUrl } from '@/lib/runtime-config'

interface VotingPanelProps {
  discussionId: string
  participantId: string
  onVoteSubmitted?: () => void
}

type VoteType = 'approve-reject' | 'rating'
type VoteStatus = 'idle' | 'loading' | 'submitted' | 'closed'

interface VoteResult {
  totalVotes: number
  approve: number
  reject: number
  abstain: number
  averageScore?: number
  winner?: 'pro_wins' | 'con_wins' | 'tie' | 'no_decision'
}

export const VotingPanel: React.FC<VotingPanelProps> = ({
  discussionId,
  participantId,
  onVoteSubmitted,
}) => {
  const [voteType, setVoteType] = useState<VoteType>('approve-reject')
  const [status, setStatus] = useState<VoteStatus>('idle')
  const [selectedVote, setSelectedVote] = useState<string | number | null>(null)
  const [ratingValue, setRatingValue] = useState<number>(3)
  const [results, setResults] = useState<VoteResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hasVoted, setHasVoted] = useState(false)

  // Check voting status
  useEffect(() => {
    checkVotingStatus()
  }, [discussionId])

  async function checkVotingStatus() {
    try {
      const data = await (discussionService as any).getVoteStatus?.(discussionId)
      if (data) {
        if (!data.isOpen) {
          setStatus('closed')
        }
        if (data.totalVotes > 0) {
          const resultsData = await (discussionService as any).getVoteResults?.(discussionId)
          if (resultsData?.results) {
            setResults(resultsData.results)
          }
        }
      }
    } catch (err: any) {
      // Voting might not have been started yet
      console.log('Voting not started')
    }
  }

  async function handleStartVoting() {
    setStatus('loading')
    setError(null)

    try {
      await fetch(buildApiUrl(`/api/v1/discussions/${discussionId}/vote/start`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ voteType }),
      })
      setStatus('idle')
    } catch (err: any) {
      setError(err.message)
      setStatus('idle')
    }
  }

  async function handleSubmitVote() {
    if (selectedVote === null) return

    setStatus('loading')
    setError(null)

    try {
      await fetch(buildApiUrl(`/api/v1/discussions/${discussionId}/vote`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          participantId,
          vote: selectedVote,
        }),
      })

      setStatus('submitted')
      setHasVoted(true)
      onVoteSubmitted?.()

      // Refresh results
      const data = await (discussionService as any).getVoteResults?.(discussionId)
      if (data?.results) {
        setResults(data.results)
      }
    } catch (err: any) {
      setError(err.message)
      setStatus('idle')
    }
  }

  // Rating component
  function RatingInput() {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              onClick={() => {
                setRatingValue(value)
                setSelectedVote(value)
              }}
              className={`w-12 h-12 rounded-lg border-2 text-xl transition-all ${
                ratingValue >= value
                  ? 'border-yellow-400 bg-yellow-50 text-yellow-500'
                  : 'border-gray-200 bg-white text-gray-300 hover:border-yellow-200'
              }`}
            >
              ★
            </button>
          ))}
        </div>
        <span className="text-sm text-gray-500">
          {ratingValue === 1 && '非常差'}
          {ratingValue === 2 && '较差'}
          {ratingValue === 3 && '一般'}
          {ratingValue === 4 && '较好'}
          {ratingValue === 5 && '非常好'}
        </span>
      </div>
    )
  }

  // Approve/Reject component
  function ApproveRejectInput() {
    const options = [
      { value: 'approve', label: '✓ 支持', color: 'bg-green-500 hover:bg-green-600' },
      { value: 'reject', label: '✗ 反对', color: 'bg-red-500 hover:bg-red-600' },
      { value: 'abstain', label: '— 弃权', color: 'bg-gray-500 hover:bg-gray-600' },
    ]

    return (
      <div className="flex flex-col sm:flex-row gap-3">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setSelectedVote(opt.value)}
            className={`flex-1 py-3 px-4 rounded-lg text-white font-medium transition-all ${
              opt.color
            } ${
              selectedVote === opt.value
                ? 'ring-2 ring-offset-2 ring-gray-400'
                : 'opacity-80'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    )
  }

  // Results visualization
  function ResultsChart() {
    if (!results) return null

    const total = results.totalVotes || 1
    const maxCount = Math.max(results.approve, results.reject, results.abstain, 1)

    if (voteType === 'rating' && results.averageScore !== undefined) {
      return (
        <div className="space-y-3">
          <div className="text-center">
            <div className="text-4xl font-bold text-blue-600">
              {results.averageScore.toFixed(1)}
            </div>
            <div className="text-sm text-gray-500">平均评分 (满分5分)</div>
          </div>
          <div className="flex justify-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <span
                key={star}
                className={`text-2xl ${
                  star <= Math.round(results.averageScore || 0)
                    ? 'text-yellow-400'
                    : 'text-gray-300'
                }`}
              >
                ★
              </span>
            ))}
          </div>
        </div>
      )
    }

    return (
      <div className="space-y-3">
        {/* Bar chart */}
        <div className="space-y-2">
          {[
            { label: '支持', value: results.approve, color: 'bg-green-500' },
            { label: '反对', value: results.reject, color: 'bg-red-500' },
            { label: '弃权', value: results.abstain, color: 'bg-gray-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex items-center gap-2">
              <span className="text-sm w-10">{label}</span>
              <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${color} transition-all duration-500`}
                  style={{ width: `${(value / maxCount) * 100}%` }}
                />
              </div>
              <span className="text-sm w-8 text-right font-medium">{value}</span>
            </div>
          ))}
        </div>

        <div className="text-center text-sm text-gray-500">
          共 {results.totalVotes} 票
        </div>

        {results.winner && (
          <div className={`text-center text-sm font-medium py-2 rounded ${
            results.winner === 'pro_wins'
              ? 'bg-green-50 text-green-700'
              : results.winner === 'con_wins'
              ? 'bg-red-50 text-red-700'
              : 'bg-gray-50 text-gray-700'
          }`}>
            {results.winner === 'pro_wins' && '🏆 正方胜出'}
            {results.winner === 'con_wins' && '🏆 反方胜出'}
            {results.winner === 'tie' && '⚖️ 平局'}
            {results.winner === 'no_decision' && '⏳ 待定'}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-800 flex items-center gap-2">
          <span className="text-lg">🗳️</span>
          投票环节
        </h3>
        {status === 'submitted' && (
          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
            ✓ 已投票
          </span>
        )}
      </div>

      {/* Vote Type Selection (before voting starts) */}
      {status !== 'submitted' && !results && (
        <div className="space-y-3">
          <div className="text-sm text-gray-600">选择投票方式：</div>
          <div className="flex gap-2">
            <button
              onClick={() => setVoteType('approve-reject')}
              className={`flex-1 py-2 px-3 rounded-lg text-sm border transition-all ${
                voteType === 'approve-reject'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              举手表决
            </button>
            <button
              onClick={() => setVoteType('rating')}
              className={`flex-1 py-2 px-3 rounded-lg text-sm border transition-all ${
                voteType === 'rating'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              评分制
            </button>
          </div>
        </div>
      )}

      {/* Vote Input */}
      {status !== 'submitted' && (
        <div className="space-y-4">
          {voteType === 'rating' ? <RatingInput /> : <ApproveRejectInput />}

          <button
            onClick={selectedVote !== null && !hasVoted ? handleSubmitVote : handleStartVoting}
            disabled={status === 'loading' || (selectedVote === null && !hasVoted)}
            className={`w-full py-2 rounded-lg font-medium transition-all ${
              selectedVote !== null && !hasVoted
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 text-gray-500 cursor-not-allowed'
            }`}
          >
            {status === 'loading'
              ? '处理中...'
              : hasVoted
              ? '已提交，等待结果...'
              : '提交投票'}
          </button>
        </div>
      )}

      {/* Results */}
      {results && <ResultsChart />}

      {/* Error */}
      {error && (
        <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
          {error}
        </div>
      )}

      {/* Status info */}
      <div className="text-xs text-gray-400 text-center">
        {voteType === 'rating'
          ? '评分范围：1-5星，5星为最佳'
          : '请选择您的立场：支持、反对或弃权'}
      </div>
    </div>
  )
}

export default VotingPanel
