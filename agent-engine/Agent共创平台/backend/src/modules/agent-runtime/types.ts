/**
 * Agent Runtime — 类型定义
 * Phase 2 对应合并方案 §7.3 Agent Runtime
 */

import type { LLMMessage } from '../llm-gateway/types'

// ── Agent Definition ────────────────────────────────────────────────────────────

export interface AgentDefinition {
  id: string
  projectId?: string
  name: string
  roleLabel: string
  description?: string
  systemPrompt: string
  defaultModel?: string
  avatar?: string
  color?: string
  isBuiltIn: boolean
  isActive: boolean
  config: AgentConfig
  createdById?: string
  createdAt: Date
  updatedAt: Date
}

export interface AgentConfig {
  temperature?: number
  maxTokens?: number
  topP?: number
  // 工具列表
  tools?: ToolDefinition[]
  // 是否注入 Wiki 上下文
  injectWikiContext?: boolean
  // 最大对话轮次
  maxTurns?: number
}

export interface ToolDefinition {
  name: string
  description: string
  parameters?: Record<string, unknown>
  // 执行方式: 'function' | 'http'
  type?: 'function' | 'http'
  endpoint?: string
  headers?: Record<string, string>
}

// ── Agent Execution ────────────────────────────────────────────────────────────

export interface AgentExecutionRequest {
  agentId: string
  conversationId?: string
  projectId?: string
  userMessage: string
  modelId?: string
  temperature?: number
  maxTokens?: number
  // Wiki 上下文注入
  wikiContext?: string
  // 自定义上下文变量
  variables?: Record<string, string>
  // 强制工具列表（可覆盖 agent config）
  tools?: ToolDefinition[]
}

export interface AgentExecutionResult {
  executionId: string
  conversationId: string
  traceId: string
  agentId: string
  modelId: string
  messages: ConversationMessage[]
  toolCalls: ToolCallEvent[]
  totalLatencyMs: number
  inputTokens: number
  outputTokens: number
}

export interface ConversationMessage {
  id: string
  role: 'system' | 'user' | 'assistant'
  content: string
  modelId?: string
  agentId?: string
  timestamp: Date
}

export interface ToolCallEvent {
  id: string
  toolName: string
  arguments: string
  result: string
  status: 'pending' | 'success' | 'error'
  latencyMs: number
  step: number
}

export interface ToolCallResult {
  toolName: string
  arguments: Record<string, unknown>
  result: unknown
  error?: string
}

// ── Agent Session ──────────────────────────────────────────────────────────────

export interface AgentSession {
  id: string
  projectId: string
  agentId: string
  conversationId: string
  modelId: string
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
  messageCount: number
  lastMessageAt: Date
  createdAt: Date
  updatedAt: Date
}

// ── SSE Event Types ────────────────────────────────────────────────────────────

export type AgentStreamEvent =
  | { type: 'execution_start'; executionId: string; agentId: string; modelId: string }
  | { type: 'message_delta'; messageId: string; content: string; done: boolean }
  | { type: 'message_end'; messageId: string; fullContent: string }
  | { type: 'tool_call_start'; eventId: string; toolName: string; arguments: string; step: number }
  | { type: 'tool_call_delta'; eventId: string; content: string }
  | { type: 'tool_call_result'; eventId: string; result: string; status: 'success' | 'error'; latencyMs: number }
  | { type: 'tool_call_end'; eventId: string }
  | { type: 'execution_end'; executionId: string; totalLatencyMs: number; inputTokens: number; outputTokens: number }
  | { type: 'error'; message: string; code?: string }

// ── LLM Request / Response helpers ────────────────────────────────────────────

export interface RenderedPrompt {
  messages: LLMMessage[]
  systemPrompt: string
  tools: ToolDefinition[]
}
