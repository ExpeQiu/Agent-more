/**
 * Agent Console — Zustand Store
 * Phase 2 前端状态管理
 */

import { create } from 'zustand'
import type { AgentDefinition, AgentSession, ConversationMessage, ToolDefinition } from './agent-service'
import type { AgentStreamEvent } from './agent-service'

// ── Types ────────────────────────────────────────────────────────────────────

interface ToolCallLog {
  id: string
  toolName: string
  arguments: string
  result: string
  status: 'pending' | 'success' | 'error'
  latencyMs: number
  step: number
  timestamp: Date
}

interface AgentMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  isStreaming?: boolean
}

interface AgentState {
  // Agent 列表
  agents: AgentDefinition[]
  agentsLoading: boolean

  // 当前选中的 Agent
  selectedAgent: AgentDefinition | null

  // 会话列表
  sessions: AgentSession[]
  sessionsLoading: boolean

  // 当前会话
  currentSession: AgentSession | null
  messages: AgentMessage[]

  // 执行状态
  isExecuting: boolean
  executionId: string | null
  currentContent: string
  toolCallLogs: ToolCallLog[]
  totalLatencyMs: number
  inputTokens: number
  outputTokens: number

  // 当前输入
  inputText: string
  selectedModel: string
  wikiContext: string

  // 错误
  error: string | null

  // 取消函数
  cancelFn: (() => void) | null
}

// ── Actions ──────────────────────────────────────────────────────────────────

interface AgentActions {
  // Agent 列表
  setAgents: (agents: AgentDefinition[]) => void
  setAgentsLoading: (v: boolean) => void
  selectAgent: (agent: AgentDefinition | null) => void

  // 会话
  setSessions: (sessions: AgentSession[]) => void
  setCurrentSession: (session: AgentSession | null) => void
  setMessages: (messages: AgentMessage[]) => void
  appendMessage: (msg: AgentMessage) => void
  updateLastMessage: (content: string, isStreaming?: boolean) => void

  // 执行
  startExecution: (executionId: string) => void
  handleStreamEvent: (event: AgentStreamEvent) => void
  endExecution: (latencyMs: number, inputTokens: number, outputTokens: number) => void
  resetExecution: () => void
  setIsExecuting: (v: boolean) => void

  // 输入
  setInputText: (text: string) => void
  setSelectedModel: (model: string) => void
  setWikiContext: (context: string) => void
  setError: (err: string | null) => void

  // 取消
  setCancelFn: (fn: (() => void) | null) => void

  // 初始化 / 重置
  initAgentConsole: () => void
}

type AgentStore = AgentState & AgentActions

// ── Store ────────────────────────────────────────────────────────────────────

export const useAgentStore = create<AgentStore>((set, get) => ({
  // Initial state
  agents: [],
  agentsLoading: false,
  selectedAgent: null,
  sessions: [],
  sessionsLoading: false,
  currentSession: null,
  messages: [],
  isExecuting: false,
  executionId: null,
  currentContent: '',
  toolCallLogs: [],
  totalLatencyMs: 0,
  inputTokens: 0,
  outputTokens: 0,
  inputText: '',
  selectedModel: 'gpt-4o',
  wikiContext: '',
  error: null,
  cancelFn: null,

  // ── Agent 列表 ──────────────────────────────────────────────────────────

  setAgents: (agents) => set({ agents }),
  setAgentsLoading: (v) => set({ agentsLoading: v }),

  selectAgent: (agent) => set({
    selectedAgent: agent,
    selectedModel: agent?.defaultModel ?? agent?.config ? (agent.config as any)?.defaultModel ?? 'gpt-4o' : 'gpt-4o',
    messages: [],
    currentContent: '',
    toolCallLogs: [],
  }),

  // ── 会话 ─────────────────────────────────────────────────────────────────

  setSessions: (sessions) => set({ sessions }),
  setCurrentSession: (session) => set({ currentSession: session }),

  setMessages: (messages) => set({ messages }),

  appendMessage: (msg) => set((state) => ({
    messages: [...state.messages, msg],
  })),

  updateLastMessage: (content, isStreaming) => set((state) => {
    const msgs = [...state.messages]
    const last = msgs[msgs.length - 1]
    if (last && last.role === 'assistant') {
      msgs[msgs.length - 1] = { ...last, content, isStreaming: isStreaming ?? last.isStreaming }
    } else {
      msgs.push({ id: `tmp-${Date.now()}`, role: 'assistant', content, timestamp: new Date(), isStreaming: true })
    }
    return { messages: msgs, currentContent: content }
  }),

  // ── 执行 ─────────────────────────────────────────────────────────────────

  startExecution: (executionId) => set({
    isExecuting: true,
    executionId,
    currentContent: '',
    toolCallLogs: [],
    totalLatencyMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    error: null,
  }),

  handleStreamEvent: (event) => {
    const state = get()

    switch (event.type) {
      case 'execution_start':
        set({ executionId: event.executionId })
        break

      case 'message_delta':
        set({
          currentContent: state.currentContent + event.content,
          isExecuting: true,
        })
        // 更新最后一个 assistant 消息
        get().updateLastMessage(state.currentContent + event.content, !event.done)
        break

      case 'message_end':
        get().appendMessage({
          id: event.messageId,
          role: 'assistant',
          content: event.fullContent,
          timestamp: new Date(),
          isStreaming: false,
        })
        break

      case 'tool_call_start': {
        const log: ToolCallLog = {
          id: event.eventId,
          toolName: event.toolName,
          arguments: event.arguments,
          result: '',
          status: 'pending',
          latencyMs: 0,
          step: event.step,
          timestamp: new Date(),
        }
        set((s) => ({ toolCallLogs: [...s.toolCallLogs, log] }))
        break
      }

      case 'tool_call_result':
        set((s) => ({
          toolCallLogs: s.toolCallLogs.map((log) =>
            log.id === event.eventId
              ? { ...log, result: event.result, status: event.status as any, latencyMs: event.latencyMs }
              : log
          ),
        }))
        break

      case 'tool_call_end':
        // nothing extra needed
        break

      case 'execution_end':
        set({
          isExecuting: false,
          totalLatencyMs: event.totalLatencyMs,
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
        })
        break

      case 'error':
        set({ isExecuting: false, error: event.message })
        break
    }
  },

  endExecution: (latencyMs, inputTokens, outputTokens) =>
    set({ isExecuting: false, totalLatencyMs: latencyMs, inputTokens, outputTokens }),

  resetExecution: () => set({
    isExecuting: false,
    executionId: null,
    currentContent: '',
    toolCallLogs: [],
    totalLatencyMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    error: null,
  }),

  setIsExecuting: (v) => set({ isExecuting: v }),

  // ── 输入 ─────────────────────────────────────────────────────────────────

  setInputText: (text) => set({ inputText: text }),
  setSelectedModel: (model) => set({ selectedModel: model }),
  setWikiContext: (context) => set({ wikiContext: context }),
  setError: (err) => set({ error: err }),
  setCancelFn: (fn) => set({ cancelFn: fn }),

  // ── 初始化 ──────────────────────────────────────────────────────────────

  initAgentConsole: () => set({
    agents: [],
    agentsLoading: false,
    selectedAgent: null,
    sessions: [],
    sessionsLoading: false,
    currentSession: null,
    messages: [],
    isExecuting: false,
    executionId: null,
    currentContent: '',
    toolCallLogs: [],
    totalLatencyMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    inputText: '',
    selectedModel: 'gpt-4o',
    wikiContext: '',
    error: null,
    cancelFn: null,
  }),
}))
