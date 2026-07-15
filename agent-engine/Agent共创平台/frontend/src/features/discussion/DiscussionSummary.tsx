/**
 * DiscussionSummary — Final summary and decision display
 * Phase 3: Multi-Agent Discussion Module
 */

import { useState } from 'react'
import { ChevronDown, ChevronUp, FileText, Download, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DiscussionSession } from './lib/discussion-service'
import { discussionService } from './lib/discussion-service'

interface DiscussionSummaryProps {
  discussion: DiscussionSession
  compact?: boolean
}

interface SummaryData {
  discussionId: string
  topic: string
  mode: string
  totalRounds: number
  totalMessages: number
  keyPoints: string[]
  agreements: string[]
  disagreements: string[]
  finalDecision?: string
  participantContributions: Record<string, string>
  generatedAt: string
}

export function DiscussionSummary({ discussion, compact = false }: DiscussionSummaryProps) {
  const [summaryData, setSummaryData] = useState<SummaryData | null>(() => {
    if (discussion.finalSummary) {
      try {
        return typeof discussion.finalSummary === 'string'
          ? JSON.parse(discussion.finalSummary)
          : discussion.finalSummary
      } catch {}
    }
    return null
  })
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(!compact)
  const [showContributions, setShowContributions] = useState(false)

  const handleLoadSummary = async () => {
    setLoading(true)
    try {
      const data = await discussionService.getSummary(discussion.id)
      if (data.summary) {
        setSummaryData(data.summary)
      }
    } catch (err) {
      console.error('[DiscussionSummary] Failed to load', err)
    } finally {
      setLoading(false)
    }
  }

  const handleExport = () => {
    if (!summaryData && !discussion.finalDecision) return

    const text = buildExportText(discussion, summaryData)
    const blob = new Blob([text], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `讨论总结_${discussion.topic.substring(0, 20)}_${discussion.id}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const hasSummary = summaryData || discussion.finalDecision

  if (!hasSummary) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center border border-dashed border-gray-300 dark:border-gray-700 rounded-xl">
        <FileText className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-2" />
        <p className="text-sm text-gray-500">讨论结束后可生成总结</p>
        {discussion.status === 'COMPLETED' && (
          <button
            onClick={handleLoadSummary}
            disabled={loading}
            className="mt-2 text-xs text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
          >
            {loading ? '加载中...' : '查看总结'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-900">
      {/* Header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          <span className="text-sm font-semibold text-gray-900 dark:text-white">讨论总结</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={e => { e.stopPropagation(); handleExport() }}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400"
            title="导出"
          >
            <Download className="w-4 h-4" />
          </button>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>

      {/* Content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Final Decision */}
          {discussion.finalDecision && (
            <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-100 dark:border-indigo-800/50">
              <div className="text-xs font-medium text-indigo-600 dark:text-indigo-400 mb-1">最终结论</div>
              <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                {discussion.finalDecision}
              </p>
            </div>
          )}

          {/* Summary Data */}
          {summaryData && (
            <>
              {/* Stats */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
                  <div className="text-lg font-bold text-gray-900 dark:text-white">{summaryData.totalRounds}</div>
                  <div className="text-xs text-gray-500">轮次</div>
                </div>
                <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
                  <div className="text-lg font-bold text-gray-900 dark:text-white">{summaryData.totalMessages}</div>
                  <div className="text-xs text-gray-500">发言数</div>
                </div>
              </div>

              {/* Key Points */}
              {summaryData.keyPoints.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-gray-500 mb-1.5">核心观点</div>
                  <ul className="space-y-1">
                    {summaryData.keyPoints.map((point, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <span className="text-indigo-500 mt-0.5">•</span>
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Agreements */}
              {summaryData.agreements.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-1.5">共识</div>
                  <div className="space-y-1">
                    {summaryData.agreements.map((item, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <span className="text-emerald-500">✓</span>
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Disagreements */}
              {summaryData.disagreements.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-red-600 dark:text-red-400 mb-1.5">分歧</div>
                  <div className="space-y-1">
                    {summaryData.disagreements.map((item, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <span className="text-red-500">✗</span>
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Participant Contributions */}
              {Object.keys(summaryData.participantContributions).length > 0 && (
                <div>
                  <button
                    onClick={() => setShowContributions(v => !v)}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    {showContributions ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    各方观点摘要
                  </button>

                  {showContributions && (
                    <div className="mt-2 space-y-2">
                      {Object.entries(summaryData.participantContributions).map(([agentId, content]) => {
                        const participant = discussion.participants.find(p => p.agentId === agentId)
                        return (
                          <div
                            key={agentId}
                            className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm"
                          >
                            <div className="flex items-center gap-1.5 mb-1">
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: participant?.agentColor || '#6b7280' }}
                              />
                              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                {participant?.agentName || agentId}
                              </span>
                            </div>
                            <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-3">
                              {content}
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Export Helper ──────────────────────────────────────────────────────────────

function buildExportText(discussion: DiscussionSession, summary: SummaryData | null): string {
  const lines: string[] = [
    `# 讨论总结`,
    ``,
    `**话题**：${discussion.topic}`,
    `**模式**：${discussion.mode}`,
    `**时间**：${new Date(discussion.createdAt).toLocaleString('zh-CN')}`,
    ``,
  ]

  if (discussion.finalDecision) {
    lines.push(`## 最终结论`)
    lines.push(``)
    lines.push(discussion.finalDecision)
    lines.push(``)
  }

  if (summary) {
    lines.push(`## 统计`)
    lines.push(`- 轮次：${summary.totalRounds}`)
    lines.push(`- 发言数：${summary.totalMessages}`)
    lines.push(``)

    if (summary.keyPoints.length > 0) {
      lines.push(`## 核心观点`)
      summary.keyPoints.forEach((p, i) => lines.push(`${i + 1}. ${p}`))
      lines.push(``)
    }

    if (summary.agreements.length > 0) {
      lines.push(`## 共识`)
      summary.agreements.forEach(a => lines.push(`- ${a}`))
      lines.push(``)
    }

    if (summary.disagreements.length > 0) {
      lines.push(`## 分歧`)
      summary.disagreements.forEach(d => lines.push(`- ${d}`))
      lines.push(``)
    }

    if (Object.keys(summary.participantContributions).length > 0) {
      lines.push(`## 各方观点`)
      Object.entries(summary.participantContributions).forEach(([agentId, content]) => {
        const p = discussion.participants.find(p => p.agentId === agentId)
        lines.push(`### ${p?.agentName || agentId}`)
        lines.push(content)
        lines.push(``)
      })
    }
  }

  return lines.join('\n')
}
