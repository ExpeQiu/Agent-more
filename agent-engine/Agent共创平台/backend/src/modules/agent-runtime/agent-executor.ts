/**
 * Agent Executor — SSE 流式执行器
 * Phase 2 对应合并方案 §5 Agent 执行流程
 *
 * 职责：
 * 1. 管理 Agent Runtime 的完整生命周期
 * 2. 工具调用循环 + SSE 事件推送
 * 3. 执行结果落库（ConversationMessage + SkillExecution）
 * 4. 生成 executionId / traceId 追踪
 */

import { randomUUID } from 'crypto'
import type { Response } from 'express'
import type { AgentDefinition, AgentExecutionRequest, AgentStreamEvent } from './types'
import type { LLMMessage } from '../llm-gateway/types'
import {
  AgentRuntime,
  renderPrompt,
} from './agent-runtime'

// ── SSE helpers ────────────────────────────────────────────────────────────────

function sse(id: string, event: string, data: unknown): string {
  return `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function sseData(id: string, data: unknown): string {
  return `id: ${id}\ndata: ${JSON.stringify(data)}\n\n`
}

type SSEWriter = (chunk: string) => void

// ── Agent Executor ─────────────────────────────────────────────────────────────

export class AgentExecutor {
  private runtime: AgentRuntime
  private request: AgentExecutionRequest
  private executionId: string
  private messages: LLMMessage[] = [] // 对话历史
  private toolEvents: AgentStreamEvent[] = []
  private startTime = 0
  private totalInputTokens = 0
  private totalOutputTokens = 0

  constructor(
    agent: AgentDefinition,
    request: AgentExecutionRequest,
    executionId?: string
  ) {
    this.executionId = executionId ?? randomUUID()
    this.runtime = new AgentRuntime(agent, request)
    this.request = request
  }

  get traceId() { return this.runtime.traceId }
  get executionIdVal() { return this.executionId }

  /**
   * 执行 Agent（流式 SSE）
   * 推送完整的事件流到前端
   */
  async *execute(write: SSEWriter): AsyncGenerator<AgentStreamEvent> {
    this.startTime = Date.now()
    const modelId = this.runtime.modelId

    // 1. 发送 execution_start
    const startEvent: AgentStreamEvent = {
      type: 'execution_start',
      executionId: this.executionId,
      agentId: this.request.agentId,
      modelId,
    }
    write(sse(`exec-${this.executionId}`, 'execution_start', startEvent))
    yield startEvent

    // 2. 渲染 Prompt
    const rendered = renderPrompt(this.runtime.agent, this.request, this.messages)
    const tools = rendered.tools

    // 3. 添加入侵消息
    const userMsgId = randomUUID()
    this.messages.push({ role: 'user', content: this.request.userMessage })

    // 4. 工具循环
    let currentContent = ''
    let step = 0
    let finishReason = 'stop'
    let toolCalls: any[] = []

    // do-while: 至少执行一次 LLM
    do {
      this.runtime.incrementTurn()
      step++

      // 调用 LLM
      const llmResult = await this.runtime.llmStep(this.messages, tools)
      currentContent = llmResult.content
      toolCalls = llmResult.toolCalls
      finishReason = llmResult.finishReason

      // 推送 message_delta
      const msgDeltaEvent: AgentStreamEvent = {
        type: 'message_delta',
        messageId: userMsgId,
        content: currentContent,
        done: toolCalls.length > 0 ? false : true,
      }
      write(sseData(`msg-${userMsgId}`, msgDeltaEvent))
      yield msgDeltaEvent

      // 如果有工具调用
      if (toolCalls.length > 0) {
        for (const tc of toolCalls) {
          // tool_call_start
          const tcStartEvent: AgentStreamEvent = {
            type: 'tool_call_start',
            eventId: tc.id,
            toolName: tc.name,
            arguments: JSON.stringify(tc.arguments),
            step,
          }
          write(sse(`tool-${tc.id}`, 'tool_call_start', tcStartEvent))
          yield tcStartEvent

          // 执行工具
          const toolResult = await this.runtime.executeTool(tc)

          // tool_call_result
          const tcResultEvent: AgentStreamEvent = {
            type: 'tool_call_result',
            eventId: tc.id,
            result: toolResult.error ?? JSON.stringify(toolResult.result),
            status: toolResult.error ? 'error' : 'success',
            latencyMs: Date.now() - this.startTime,
          }
          write(sse(`tool-${tc.id}`, 'tool_call_result', tcResultEvent))
          yield tcResultEvent

          // tool_call_end
          const tcEndEvent: AgentStreamEvent = { type: 'tool_call_end', eventId: tc.id }
          write(sse(`tool-${tc.id}`, 'tool_call_end', tcEndEvent))
          yield tcEndEvent

          // 把工具结果作为消息追加（支持多轮工具）
          this.messages.push(this.runtime.formatToolResultMessage(tc, toolResult))
        }

        // 有工具调用 → while 条件判断是否继续
      }
      // 无工具调用 → while 条件为 false，退出循环
    } while (this.runtime.shouldContinue(toolCalls, finishReason))

    // 5. message_end
    const msgEndEvent: AgentStreamEvent = {
      type: 'message_end',
      messageId: userMsgId,
      fullContent: currentContent,
    }
    write(sse(`msg-${userMsgId}`, 'message_end', msgEndEvent))
    yield msgEndEvent

    // 6. 保存 assistant 消息
    this.messages.push({ role: 'assistant', content: currentContent })

    // 7. execution_end
    const totalMs = Date.now() - this.startTime
    const endEvent: AgentStreamEvent = {
      type: 'execution_end',
      executionId: this.executionId,
      totalLatencyMs: totalMs,
      inputTokens: this.totalInputTokens,
      outputTokens: this.totalOutputTokens,
    }
    write(sse(`exec-${this.executionId}`, 'execution_end', endEvent))
    yield endEvent
  }

  /**
   * 完整执行并收集结果（非流式，供内部使用）
   */
  async executeSync(): Promise<{
    content: string
    toolCalls: { name: string; arguments: string; result: string; status: string; latencyMs: number }[]
    totalLatencyMs: number
  }> {
    const toolCalls: any[] = []

    const write = (_chunk: string) => {
      // 流式写入 /dev/null（用于同步模式）
    }

    for await (const event of this.execute(write)) {
      if (event.type === 'tool_call_result') {
        toolCalls.push(event)
      }
    }

    const lastMsg = this.messages[this.messages.length - 1]
    return {
      content: lastMsg?.content ?? '',
      toolCalls,
      totalLatencyMs: Date.now() - this.startTime,
    }
  }
}

// ── Execute with SSE streaming ───────────────────────────────────────────────

export async function executeAgentSSE(
  agent: AgentDefinition,
  request: AgentExecutionRequest,
  res: Response
) {
  const executor = new AgentExecutor(agent, request)

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  const write = (chunk: string) => {
    res.write(chunk)
  }

  try {
    // 完全消费 iterator 以确保所有事件发出
    for await (const _event of executor.execute(write)) {
      // 事件已在 write() 中推送
    }
  } catch (err: any) {
    const errorEvent: AgentStreamEvent = {
      type: 'error',
      message: err?.message ?? 'Execution failed',
      code: err?.code,
    }
    res.write(sse(`exec-${executor.executionIdVal}`, 'error', errorEvent))
  } finally {
    res.end()
  }
}
