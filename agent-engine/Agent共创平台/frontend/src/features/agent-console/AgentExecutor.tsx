'use client'

/**
 * AgentExecutor — Agent 执行器组件
 * Phase 2 手动 Agent 调用 — 输入 + 执行 + 结果展示
 */

import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { Send, Square, Loader2, Bot, Settings2 } from 'lucide-react'
import { useAgentStore } from './lib/agent-store'
import { agentService } from './lib/agent-service'
import { AVAILABLE_MODELS } from '../ai-chat/lib/models'

interface AgentExecutorProps {
  projectId?: string
  conversationId?: string
  onConversationIdChange?: (id: string) => void
}

export function AgentExecutor({ projectId, conversationId, onConversationIdChange }: AgentExecutorProps) {
  const {
    selectedAgent,
    isExecuting,
    messages,
    currentContent,
    toolCallLogs,
    inputText,
    selectedModel,
    wikiContext,
    error,
    cancelFn,
    setInputText,
    setSelectedModel,
    setWikiContext,
    startExecution,
    handleStreamEvent,
    endExecution,
    resetExecution,
    setIsExecuting,
    setCancelFn,
    setError,
    appendMessage,
    initAgentConsole,
  } = useAgentStore()

  const [showSettings, setShowSettings] = useState(false)
  const [contextInput, setContextInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, currentContent])

  // Adjust textarea height
  const adjustHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`
    }
  }

  useEffect(() => {
    adjustHeight()
  }, [inputText])

  const handleSend = async () => {
    if (!inputText.trim() || !selectedAgent || isExecuting) return

    const userMessage = inputText
    setInputText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    // 添加用户消息
    appendMessage({ id: `user-${Date.now()}`, role: 'user', content: userMessage, timestamp: new Date() })

    if (!selectedAgent) return

    // 开始执行
    const execId = `exec-${Date.now()}`
    startExecution(execId)

    // 取消之前的
    if (cancelFn) cancelFn()

    // 调用 API
    const cancel = agentService.executeAgent(
      {
        agentId: selectedAgent.id,
        conversationId,
        projectId,
        userMessage,
        modelId: selectedModel,
        wikiContext: wikiContext || contextInput,
      },
      {
        onEvent: (event) => {
          handleStreamEvent(event)
        },
        onError: (err) => {
          setError(err.message)
          setIsExecuting(false)
        },
      }
    )

    setCancelFn(cancel)

    // 等待执行完成（实际上流式事件会自动更新状态）
    // 这里用一个轮询检查 isExecuting
  }

  const handleCancel = () => {
    if (cancelFn) {
      cancelFn()
      setCancelFn(null)
      setIsExecuting(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleReset = () => {
    if (isExecuting) handleCancel()
    initAgentConsole()
  }

  // No agent selected state
  if (!selectedAgent) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-16 px-4">
        <Bot className="w-12 h-12 text-gray-200 dark:text-gray-700 mb-4" />
        <p className="text-base font-medium text-gray-400 dark:text-gray-500 mb-1">未选择 Agent</p>
        <p className="text-sm text-gray-400 dark:text-gray-600">
          请在左侧选择一个 Agent 开始对话
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Agent Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-white dark:bg-gray-900">
        <div className="flex items-center gap-2">
          {selectedAgent.avatar ? (
            <span className="text-base">{selectedAgent.avatar}</span>
          ) : (
            <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ backgroundColor: selectedAgent.color ?? '#6366f1' }}>
              {selectedAgent.name[0]}
            </span>
          )}
          <div>
            <span className="font-medium text-sm text-gray-900 dark:text-white">{selectedAgent.name}</span>
            <span className="text-xs text-gray-400 ml-1.5">({selectedAgent.roleLabel})</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* 模型选择 */}
          <select
            value={selectedModel}
            onChange={e => setSelectedModel(e.target.value)}
            className="text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-2 py-1.5 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {AVAILABLE_MODELS.slice(0, 12).map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>

          {/* 设置 */}
          <button
            onClick={() => setShowSettings(v => !v)}
            className={`p-1.5 rounded-md transition-colors ${showSettings ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
            title="上下文设置"
          >
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Wiki / 知识库上下文（注入到 system prompt）
          </label>
          <textarea
            value={contextInput}
            onChange={e => { setContextInput(e.target.value); setWikiContext(e.target.value) }}
            rows={3}
            placeholder="粘贴相关背景知识、文档内容，AI 将参考这些信息..."
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none" />
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50 dark:bg-gray-800/30">
        {messages.length === 0 && !isExecuting && (
          <div className="text-center py-8">
            <p className="text-sm text-gray-400 dark:text-gray-600">
              输入问题，<span className="font-medium">{selectedAgent.name}</span> 将为您解答
            </p>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5"
                style={{ backgroundColor: selectedAgent.color ?? '#6366f1' }}>
                {selectedAgent.name[0]}
              </span>
            )}
            <div className={`max-w-[75%] rounded-xl px-3.5 py-2.5 text-sm ${
              msg.role === 'user'
                ? 'bg-indigo-600 text-white rounded-br-sm'
                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-bl-sm'
            }`}>
              <div className="whitespace-pre-wrap prose prose-sm dark:prose-invert max-w-none">
                {msg.content || (msg.isStreaming ? (
                  <span className="inline-flex gap-0.5">
                    <span className="animate-pulse">▊</span>
                  </span>
                ) : null)}
              </div>
            </div>
          </div>
        ))}

        {/* Streaming content (not yet in messages) */}
        {isExecuting && messages[messages.length - 1]?.role !== 'assistant' && currentContent && (
          <div className="flex gap-2.5 justify-start">
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5"
              style={{ backgroundColor: selectedAgent.color ?? '#6366f1' }}>
              {selectedAgent.name[0]}
            </span>
            <div className="max-w-[75%] rounded-xl rounded-bl-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3.5 py-2.5">
              <div className="whitespace-pre-wrap prose prose-sm dark:prose-invert max-w-none text-gray-800 dark:text-gray-100">
                {currentContent}<span className="animate-pulse inline-block ml-0.5">▊</span>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex gap-2.5 justify-start">
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5 bg-red-500">
              !
            </span>
            <div className="max-w-[75%] rounded-xl rounded-bl-sm bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3.5 py-2.5">
              <p className="text-sm text-red-700 dark:text-red-300 whitespace-pre-wrap">{error}</p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Tool call mini-summary */}
      {toolCallLogs.length > 0 && (
        <div className="px-4 py-1.5 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2 overflow-x-auto">
          <span className="text-[10px] text-gray-400 shrink-0">工具:</span>
          {toolCallLogs.slice(-3).map(log => (
            <span key={log.id} className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
              log.status === 'success' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
              log.status === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
              'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
            }`}>
              {log.toolName}
            </span>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`向 ${selectedAgent.name} 提问... (Enter 发送，Shift+Enter 换行)`}
            disabled={isExecuting}
            rows={1}
            className="flex-1 resize-none rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-3 py-2.5 pr-10 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 max-h-40 overflow-y-auto"
          />
          {isExecuting ? (
            <button
              onClick={handleCancel}
              className="shrink-0 p-2.5 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
              title="停止执行"
            >
              <Square className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!inputText.trim()}
              className="shrink-0 p-2.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="发送"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex items-center justify-between mt-1.5 text-[10px] text-gray-400">
          <span>{selectedAgent.systemPrompt.slice(0, 40)}…</span>
          <span>Enter 发送 · Shift+Enter 换行</span>
        </div>
      </div>
    </div>
  )
}
