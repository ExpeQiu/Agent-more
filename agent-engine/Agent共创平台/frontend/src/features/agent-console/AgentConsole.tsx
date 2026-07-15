'use client'

/**
 * AgentConsole — Agent 控制台主页面
 * Phase 2 手动 Agent 调用 — 三栏布局
 *
 * 布局：
 * - 左侧：Agent 列表
 * - 中间：输入框 + 执行结果展示区
 * - 右侧：工具调用日志 / 执行日志
 */

import { useState } from 'react'
import { useAgentStore } from './lib/agent-store'
import { AgentList } from './AgentList'
import { AgentExecutor } from './AgentExecutor'
import { ToolCallLog } from './ToolCallLog'
import { PanelRightClose, PanelRight, MessageSquare } from 'lucide-react'

interface AgentConsoleProps {
  projectId?: string
  conversationId?: string
  onConversationIdChange?: (id: string) => void
}

export function AgentConsole({ projectId, conversationId, onConversationIdChange }: AgentConsoleProps) {
  const { selectedAgent } = useAgentStore()
  const [showToolPanel, setShowToolPanel] = useState(true)

  return (
    <div className="flex h-full bg-gray-50 dark:bg-gray-900">
      {/* Left: Agent List */}
      <div className="w-64 shrink-0 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex flex-col overflow-hidden">
        <AgentList projectId={projectId} />
      </div>

      {/* Center: Agent Executor */}
      <div className="flex-1 min-w-0 flex flex-col">
        <AgentExecutor
          projectId={projectId}
          conversationId={conversationId}
          onConversationIdChange={onConversationIdChange}
        />
      </div>

      {/* Right: Tool Call Log */}
      {selectedAgent && showToolPanel && (
        <div className="w-80 shrink-0 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between p-1.5 border-b border-gray-200 dark:border-gray-700">
            <ToolCallLog className="flex-1" />
          </div>
        </div>
      )}

      {/* Right panel toggle (when no agent selected or panel closed) */}
      {selectedAgent && !showToolPanel && (
        <button
          onClick={() => setShowToolPanel(true)}
          className="absolute right-4 bottom-24 z-10 p-2 rounded-full bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          title="显示工具日志"
        >
          <PanelRight className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}

// Default export for lazy loading
export default AgentConsole
