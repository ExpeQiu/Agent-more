/**
 * Agent Runtime — 核心引擎
 * Phase 2 对应合并方案 §7.3 Agent Runtime
 *
 * 职责：
 * 1. 加载 AgentDefinition 并渲染 systemPrompt
 * 2. 组装上下文（用户输入 + Wiki 上下文）
 * 3. 工具调用循环（function calling loop）
 * 4. 生成 traceId 供执行追踪
 */

import { randomUUID } from 'crypto'
import type {
  AgentDefinition,
  AgentExecutionRequest,
  ToolDefinition,
  ToolCallResult,
  RenderedPrompt,
} from './types'
import type { LLMMessage, LLMStreamChunk } from '../llm-gateway/types'

// ── Adapter imports（与 chat.ts 共享）────────────────────────────────────────

import { OpenAIAdapter } from '../llm-gateway/adapters/openai.adapter'
import { ClaudeAdapter } from '../llm-gateway/adapters/claude.adapter'
import { GoogleAdapter } from '../llm-gateway/adapters/google.adapter'
import { DeepSeekAdapter } from '../llm-gateway/adapters/deepseek.adapter'
import { DashScopeAdapter } from '../llm-gateway/adapters/dashscope.adapter'
import { GLMAdapter } from '../llm-gateway/adapters/glm.adapter'
import { MiniMaxAdapter } from '../llm-gateway/adapters/minimax.adapter'
import { OllamaAdapter } from '../llm-gateway/adapters/ollama.adapter'
import { AVAILABLE_MODELS } from '../llm-gateway/types'

// ── Environment ────────────────────────────────────────────────────────────────

const OPENAI_API_KEY    = process.env.OPENAI_API_KEY || ''
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''
const GOOGLE_API_KEY    = process.env.GOOGLE_API_KEY || ''
const DEEPSEEK_API_KEY  = process.env.DEEPSEEK_API_KEY || ''
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || ''
const GLM_API_KEY       = process.env.GLM_API_KEY || ''
const MINIMAX_API_KEY   = process.env.MINIMAX_API_KEY || ''
const MINIMAX_GROUP_ID  = process.env.MINIMAX_GROUP_ID || ''
const OLLAMA_BASE_URL   = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
const OLLAMA_API_KEY    = process.env.OLLAMA_API_KEY || ''

// ── Adapter factory ───────────────────────────────────────────────────────────

function createAdapter(modelId: string) {
  if (modelId.startsWith('gpt-')) return new OpenAIAdapter(OPENAI_API_KEY)
  if (modelId.startsWith('claude-')) return new ClaudeAdapter(ANTHROPIC_API_KEY)
  if (modelId.startsWith('gemini-')) return new GoogleAdapter(GOOGLE_API_KEY)
  if (modelId.startsWith('deepseek-')) return new DeepSeekAdapter(DEEPSEEK_API_KEY)
  if (modelId.startsWith('qwen-') || modelId.startsWith('qwq-')) return new DashScopeAdapter(DASHSCOPE_API_KEY)
  if (modelId.startsWith('glm-')) return new GLMAdapter(GLM_API_KEY)
  if (modelId.startsWith('minimax-') || modelId === 'abab6.5-chat') return new MiniMaxAdapter(MINIMAX_API_KEY, MINIMAX_GROUP_ID)
  if (modelId.includes(':')) return new OllamaAdapter(OLLAMA_BASE_URL, OLLAMA_API_KEY)
  return null
}

function getApiModelName(modelId: string): string {
  return AVAILABLE_MODELS.find(m => m.id === modelId)?.apiName ?? modelId
}

// ── Tool registry ────────────────────────────────────────────────────────────
// 运行时注册的工具实现（可扩展）

export type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>

// ── Event callbacks ──────────────────────────────────────────────────────────

export interface AgentRuntimeCallbacks {
  /** LLM streaming token chunk */
  onChunk?: (chunk: LLMStreamChunk) => void
  /** LLM 返回 tool_calls 时触发（解析完成后） */
  onToolCall?: (toolCall: ParsedToolCall) => void
  /** 工具执行完成后触发（成功或失败均会调用） */
  onToolResult?: (result: ToolCallResult, toolCall: ParsedToolCall) => void
  /** 单步 LLM 调用结束（不论是否有工具调用） */
  onStepEnd?: (step: number, content: string, toolCalls: ParsedToolCall[], finishReason: string) => void
}

const toolRegistry = new Map<string, ToolHandler>()

export function registerTool(name: string, handler: ToolHandler) {
  toolRegistry.set(name, handler)
}

export function getToolHandler(name: string): ToolHandler | undefined {
  return toolRegistry.get(name)
}

// ── Prompt Renderer ──────────────────────────────────────────────────────────

/**
 * 渲染完整的对话消息列表
 * 包含 systemPrompt（含 Wiki 上下文注入） + 历史消息 + 当前用户输入
 */
export function renderPrompt(
  agent: AgentDefinition,
  request: AgentExecutionRequest,
  historyMessages: LLMMessage[] = []
): RenderedPrompt {
  // 构建 system prompt
  let systemContent = agent.systemPrompt

  // 注入 Wiki 上下文
  if (agent.config.injectWikiContext && request.wikiContext) {
    systemContent += '\n\n## 知识库上下文\n' + request.wikiContext
  }

  // 注入自定义变量
  if (request.variables) {
    const varsSection = Object.entries(request.variables)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join('\n')
    systemContent += '\n\n## 会话变量\n' + varsSection
  }

  // 构建消息列表
  const messages: LLMMessage[] = [
    { role: 'system', content: systemContent },
    ...historyMessages,
    { role: 'user', content: request.userMessage },
  ]

  // 工具列表
  const tools = request.tools ?? agent.config.tools ?? []

  return {
    messages,
    systemPrompt: systemContent,
    tools,
  }
}

// ── OpenAI-format tools ──────────────────────────────────────────────────────

/**
 * 将 ToolDefinition 转换为 OpenAI function calling 格式
 */
export function toOpenAITools(tools: ToolDefinition[]): unknown[] {
  return tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters ?? {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  }))
}

// ── Tool call parser ─────────────────────────────────────────────────────────

export interface ParsedToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

/**
 * 从 LLM 内容中解析 tool_calls 块
 * 支持 JSON 格式: {"tool_calls": [{"id": "...", "name": "...", "arguments": {...}}]}
 */
export function parseToolCalls(content: string): ParsedToolCall[] {
  try {
    const parsed = JSON.parse(content)
    if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
      return parsed.tool_calls.map((tc: any) => ({
        id: tc.id || randomUUID(),
        name: tc.name || tc.function?.name,
        arguments: typeof tc.arguments === 'string'
          ? JSON.parse(tc.arguments)
          : (tc.arguments || tc.function?.arguments || {}),
      }))
    }
  } catch {
    // 不是 JSON，尝试从文本中提取
  }

  // 备用：直接解析 tool_call 数组
  try {
    const match = content.match(/"tool_calls"\s*:\s*\[([\s\S]*?)\]/)
    if (match) {
      const arr = JSON.parse(`[${match[1]}]`)
      return arr.map((tc: any) => ({
        id: tc.id || randomUUID(),
        name: tc.name || tc.function?.name,
        arguments: typeof tc.arguments === 'string'
          ? JSON.parse(tc.arguments)
          : (tc.arguments || tc.function?.arguments || {}),
      }))
    }
  } catch {
    // ignore
  }

  return []
}

// ── LLM Chat call (non-streaming, for tool execution) ───────────────────────

export async function llmChat(
  modelId: string,
  messages: LLMMessage[],
  tools: ToolDefinition[] = [],
  temperature = 0.7,
  maxTokens = 4096
): Promise<{ content: string; usage?: { inputTokens: number; outputTokens: number } }> {
  const adapter = createAdapter(modelId)
  if (!adapter) throw new Error(`No adapter for model: ${modelId}`)

  const apiModel = getApiModelName(modelId)

  // 使用流式接口收集完整内容
  let fullContent = ''
  const toolChunks: LLMStreamChunk[] = []

  for await (const chunk of adapter.chatStream!({
    model: apiModel,
    messages,
    temperature,
    maxTokens,
    // 工具格式适配
  })) {
    fullContent += chunk.content
    toolChunks.push(chunk)
  }

  // 简单取第一个 chunk 的 usage（实际 adapter 应在 done=true 时返回）
  const usage = toolChunks[toolChunks.length - 1]?.usage

  return { content: fullContent, usage }
}

// ── Main Agent Runtime class ─────────────────────────────────────────────────

export class AgentRuntime {
  readonly traceId: string
  readonly agent: AgentDefinition
  readonly request: AgentExecutionRequest
  readonly modelId: string
  private _turn = 0
  readonly maxTurns: number
  private callbacks: AgentRuntimeCallbacks

  constructor(
    agent: AgentDefinition,
    request: AgentExecutionRequest,
    traceId?: string,
    callbacks: AgentRuntimeCallbacks = {}
  ) {
    this.traceId = traceId ?? randomUUID()
    this.agent = agent
    this.request = request
    this.modelId = request.modelId ?? agent.defaultModel ?? 'gpt-4o'
    this.maxTurns = agent.config.maxTurns ?? 10
    this.callbacks = callbacks
  }

  /** 更新回调（可在执行过程中动态注册） */
  setCallbacks(callbacks: AgentRuntimeCallbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks }
  }

  /**
   * 执行单轮 LLM 调用（不含工具循环）
   * 通过 callbacks 推送流式 chunks、tool_calls 解析结果
   * 返回 assistant 的文本内容（可能是最终答案，也可能包含 tool_calls）
   */
  async llmStep(
    messages: LLMMessage[],
    tools: ToolDefinition[]
  ): Promise<{ content: string; toolCalls: ParsedToolCall[]; finishReason: string }> {
    const adapter = createAdapter(this.modelId)
    if (!adapter) throw new Error(`No adapter for model: ${this.modelId}`)

    const apiModel = getApiModelName(this.modelId)
    let fullContent = ''
    let finishReason = 'stop'

    // OpenAI 格式工具
    const openaiTools = toOpenAITools(tools)

    for await (const chunk of adapter.chatStream!({
      model: apiModel,
      messages,
      temperature: this.request.temperature ?? this.agent.config.temperature ?? 0.7,
      maxTokens: this.request.maxTokens ?? this.agent.config.maxTokens ?? 4096,
      // @ts-ignore — 部分 adapter 支持 extra options
      tools: openaiTools.length > 0 ? openaiTools : undefined,
    })) {
      fullContent += chunk.content

      // 推送 streaming chunk callback
      this.callbacks.onChunk?.(chunk)

      if (chunk.done) {
        // done 时 adapter 可能标注 finish_reason
        finishReason = (chunk as any).finishReason ?? 'stop'
      }
    }

    const toolCalls = parseToolCalls(fullContent)

    // 推送 tool_call 解析完成 callback
    for (const tc of toolCalls) {
      this.callbacks.onToolCall?.(tc)
    }

    return { content: fullContent, toolCalls, finishReason }
  }

  /**
   * 完整的工具调用循环（推荐入口）
   * 在 AgentExecutor 中使用；如直接使用请务必调用此方法
   *
   * @param messages 对话历史（会被原位修改，追加 tool result messages）
   * @param tools 可用工具列表
   * @returns 最终 assistant 内容 + 所有 tool 执行记录
   */
  async runToolLoop(
    messages: LLMMessage[],
    tools: ToolDefinition[]
  ): Promise<{ content: string; toolCallResults: ToolCallResult[] }> {
    const allToolResults: ToolCallResult[] = []
    let content = ''
    let finishReason = 'stop'

    while (this._turn < this.maxTurns) {
      this._turn++

      const stepResult = await this.llmStep(messages, tools)
      content = stepResult.content
      finishReason = stepResult.finishReason

      // 单步结束回调
      this.callbacks.onStepEnd?.(this._turn, content, stepResult.toolCalls, finishReason)

      if (stepResult.toolCalls.length === 0) {
        // 无工具调用，正常结束
        break
      }

      // 执行所有工具调用
      for (const tc of stepResult.toolCalls) {
        const result = await this.executeTool(tc)
        allToolResults.push(result)

        // 工具结果回调
        this.callbacks.onToolResult?.(result, tc)

        // 将工具结果追加为消息
        messages.push(this.formatToolResultMessage(tc, result))
      }

      // 若 LLM 明确要求停止，不再继续
      if (finishReason === 'stop' || finishReason === 'end_turn') {
        break
      }
    }

    return { content, toolCallResults: allToolResults }
  }

  /**
   * 执行工具（支持 HTTP 工具和注册的工具）
   * 错误分类：UnknownTool / Timeout / ExecutionError
   */
  async executeTool(toolCall: ParsedToolCall): Promise<ToolCallResult> {
    // 1. 优先查注册的工具 handler
    const handler = getToolHandler(toolCall.name)

    if (handler) {
      try {
        const result = await handler(toolCall.arguments)
        return {
          toolName: toolCall.name,
          arguments: toolCall.arguments,
          result,
          error: undefined,
        }
      } catch (err: any) {
        const errorMessage = err?.message ?? 'Tool execution failed'
        // 区分超时和其他错误
        if (err?.code === 'ETIMEDOUT' || err?.name === 'TimeoutError') {
          return {
            toolName: toolCall.name,
            arguments: toolCall.arguments,
            result: null,
            error: `[Timeout] ${errorMessage}`,
          }
        }
        return {
          toolName: toolCall.name,
          arguments: toolCall.arguments,
          result: null,
          error: `[ExecutionError] ${errorMessage}`,
        }
      }
    }

    // 2. 未知工具
    return {
      toolName: toolCall.name,
      arguments: toolCall.arguments,
      result: null,
      error: `[UnknownTool] No handler registered for tool: ${toolCall.name}`,
    }
  }

  /**
   * 将工具结果格式化为消息
   */
  formatToolResultMessage(toolCall: ParsedToolCall, result: ToolCallResult): LLMMessage {
    return {
      role: 'user', // 工具结果作为 user 消息喂回
      content: JSON.stringify({
        tool_call_id: toolCall.id,
        name: toolCall.name,
        result: result.error ?? result.result,
      }),
    }
  }

  /**
   * 检查是否应该继续工具调用循环
   * 注意：大多数模型在有 tool_calls 时仍返回 finishReason='stop'，
   * 因此以 toolCalls.length > 0 为主要判断依据
   */
  shouldContinue(toolCalls: ParsedToolCall[], _finishReason: string): boolean {
    if (this._turn >= this.maxTurns) return false
    return toolCalls.length > 0
  }

  incrementTurn() {
    this._turn++
  }

  get turn() {
    return this._turn
  }
}
