'use client'

/**
 * ToolCallLog — 工具调用日志组件
 * Phase 2 实时展示 SSE 工具调用事件
 */

import { useAgentStore } from './lib/agent-store'
import { CheckCircle, XCircle, Loader2, Zap, ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'

function ToolCallItem({ log }: { log: any }) {
  const [expanded, setExpanded] = useState(false)

  const statusIcon = {
    pending: <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" />,
    success: <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />,
    error: <XCircle className="w-3.5 h-3.5 text-red-500" />,
  }[log.status]

  const statusText = {
    pending: '执行中',
    success: '成功',
    error: '失败',
  }[log.status]

  const statusColor = {
    pending: 'text-gray-400',
    success: 'text-emerald-600 dark:text-emerald-400',
    error: 'text-red-600 dark:text-red-400',
  }[log.status]

  let parsedArgs = log.arguments
  try { parsedArgs = JSON.stringify(JSON.parse(log.arguments), null, 2) } catch { /* use as-is */ }

  let parsedResult = log.result
  try { parsedResult = JSON.stringify(JSON.parse(log.result), null, 2) } catch { /* use as-is */ }

  return (
    <div className={`rounded-lg border transition-colors ${
      log.status === 'pending' ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50' :
      log.status === 'error' ? 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10' :
      'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10'
    }`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        <span className="shrink-0">{expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}</span>
        <span className="shrink-0">{statusIcon}</span>
        <span className="flex-1 min-w-0">
          <span className="text-xs font-mono font-medium text-gray-800 dark:text-gray-200 truncate block">
            {log.toolName}
          </span>
        </span>
        <span className={`text-[10px] font-medium ${statusColor}`}>{statusText}</span>
        {log.latencyMs > 0 && (
          <span className="text-[10px] text-gray-400">{log.latencyMs}ms</span>
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-3 pt-1 space-y-2">
          <div>
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">参数</p>
            <pre className="text-xs font-mono bg-white dark:bg-gray-900 rounded p-2 border border-gray-200 dark:border-gray-700 overflow-x-auto max-h-48 text-gray-700 dark:text-gray-300">
              {parsedArgs || '(无参数)'}
            </pre>
          </div>
          {log.result && (
            <div>
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">结果</p>
              <pre className={`text-xs font-mono bg-white dark:bg-gray-900 rounded p-2 border overflow-x-auto max-h-48 ${
                log.status === 'error' ? 'border-red-200 dark:border-red-800 text-red-700 dark:text-red-300' : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
              }`}>
                {parsedResult}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface ToolCallLogProps {
  className?: string
}

export function ToolCallLog({ className = '' }: ToolCallLogProps) {
  const { toolCallLogs, isExecuting, totalLatencyMs, inputTokens, outputTokens } = useAgentStore()

  const pendingCount = toolCallLogs.filter(l => l.status === 'pending').length
  const errorCount = toolCallLogs.filter(l => l.status === 'error').length

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <h3 className="font-medium text-sm text-gray-700 dark:text-gray-300">工具调用</h3>
          </div>
          {toolCallLogs.length > 0 && (
            <div className="flex items-center gap-2">
              {errorCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                  {errorCount} 失败
                </span>
              )}
              <span className="text-[10px] text-gray-400">{toolCallLogs.length} 次调用</span>
            </div>
          )}
        </div>

        {/* Stats bar */}
        {(totalLatencyMs > 0 || inputTokens > 0 || outputTokens > 0) && (
          <div className="flex gap-3 mt-2 text-[10px] text-gray-400">
            {totalLatencyMs > 0 && <span>耗时: <strong className="text-gray-600 dark:text-gray-300">{totalLatencyMs}ms</strong></span>}
            {inputTokens > 0 && <span>输入: <strong className="text-gray-600 dark:text-gray-300">{inputTokens} tokens</strong></span>}
            {outputTokens > 0 && <span>输出: <strong className="text-gray-600 dark:text-gray-300">{outputTokens} tokens</strong></span>}
          </div>
        )}
      </div>

      {/* Log list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {toolCallLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <Zap className="w-8 h-8 text-gray-200 dark:text-gray-700 mb-2" />
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {isExecuting ? '等待工具调用...' : '暂无工具调用记录'}
            </p>
          </div>
        ) : (
          toolCallLogs.map(log => (
            <ToolCallItem key={log.id} log={log} />
          ))
        )}

        {/* In-progress indicator */}
        {isExecuting && pendingCount === 0 && toolCallLogs.length > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            处理中...
          </div>
        )}
      </div>
    </div>
  )
}
