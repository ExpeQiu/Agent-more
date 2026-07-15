/**
 * Agent 编排服务
 * 从 todify4 backend/services/agent/AgentOrchestrator.ts 移植
 * 负责执行完整的 Agent 流程
 */
import type { ChatMessage, Tool, ILLMProvider, LLMResponse } from '../types/llm';
import type { ToolConfig, DirectAgentConfig } from '../types/agent';
import type { LLMConfig } from '../types/llm';
import type { AgentDependencies, ILLMProviderFactory } from '../interfaces';
import { PromptManager } from '../prompt/PromptManager';
import { ContextManager } from '../context/ContextManager';
import { ToolExecutor } from '../executor/ToolExecutor';
import { AgentError, AgentErrorHandler, AgentErrorCode } from '../types/error';

function generateUUID(): string {
  // Simple UUID v4 implementation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Agent 执行结果
 */
export interface AgentExecutionResult {
  content: string;
  conversationId: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  metadata?: any;
}

/**
 * 工具调用历史项
 */
interface ToolCallHistoryItem {
  toolName: string;
  status: string;
  error?: string;
}

export interface AgentOrchestratorConfig {
  dependencies: AgentDependencies;
  maxToolCallIterations?: number;
  maxExecutionTime?: number;
  mockMode?: boolean;
}

export class AgentOrchestrator {
  private config: AgentOrchestratorConfig;
  private promptManager: PromptManager;
  private contextManager: ContextManager;
  private toolExecutor: ToolExecutor;
  private maxToolCallIterations: number;
  private maxExecutionTime: number;
  private mockMode: boolean;
  
  // 执行状态
  private currentExecutionId: string = '';
  private currentAgentId: string = '';
  private currentConversationId: string = '';
  private toolCallsHistory: ToolCallHistoryItem[] = [];

  constructor(config: AgentOrchestratorConfig) {
    this.config = config;
    this.promptManager = new PromptManager();
    this.contextManager = new ContextManager({
      chatMessageService: config.dependencies.chatMessageService,
      llmProviderFactory: config.dependencies.llmProviderFactory
    });
    this.toolExecutor = new ToolExecutor({
      roleModel: config.dependencies.roleModel,
      difyClient: config.dependencies.difyClient,
      difyGateway: config.dependencies.difyGateway,
      workflowEngine: config.dependencies.workflowEngine,
      llmProviderFactory: config.dependencies.llmProviderFactory
    });
    this.maxToolCallIterations = config.maxToolCallIterations ?? 10;
    this.maxExecutionTime = config.maxExecutionTime ?? 360000;
    this.mockMode = config.mockMode ?? false;
  }

  /**
   * 执行 Agent（核心方法）
   */
  async executeAgent(
    roleId: string,
    query: string,
    conversationId: string = '',
    context: Record<string, any> = {}
  ): Promise<AgentExecutionResult> {
    const executionId = context.executionId || `exec-${Date.now()}-${generateUUID()}`;
    this.currentExecutionId = executionId;
    this.currentAgentId = roleId;

    if (this.mockMode) {
      const mockResult = await this.getMockResponse(roleId, query, context);
      await this.logStep(executionId, 'mock_response', {
        type: 'mock',
        input: { query, context },
        output: { content: mockResult.content },
        duration: 0,
        status: 'success'
      });
      return mockResult;
    }

    const startTime = Date.now();
    
    const checkTimeout = () => {
      const elapsed = Date.now() - startTime;
      if (elapsed > this.maxExecutionTime) {
        throw new Error(`Agent执行超时：已执行 ${Math.round(elapsed / 1000)} 秒，超过最大执行时间 ${this.maxExecutionTime / 1000} 秒`);
      }
    };
    
    try {
      // 1. 获取 Agent 配置
      checkTimeout();
      await this.logStep(executionId, 'load_config', {
        type: 'config',
        input: { roleId },
        output: null,
        duration: 0,
        status: 'success'
      });

      const role = await this.config.dependencies.roleModel.getById(roleId);
      if (!role) {
        throw new Error(`AI角色不存在: ${roleId}`);
      }

      let agentConfig: DirectAgentConfig;
      try {
        const configData = JSON.parse(role.dify_config || '{}');
        if (!configData.agentConfig) {
          throw new Error(`Agent配置不存在: ${roleId}`);
        }
        agentConfig = configData.agentConfig;
      } catch (e) {
        throw new Error(`Agent配置不存在或解析失败: ${roleId}`);
      }

      // 2. 生成或使用 conversationId
      const finalConversationId = conversationId || this.generateConversationId();
      this.currentConversationId = finalConversationId;
      this.toolCallsHistory = [];

      // 3. 验证 prompt 配置
      if (!agentConfig.prompt?.systemPrompt) {
        throw new Error(`Agent prompt配置不存在: ${roleId}`);
      }

      // 4. 渲染 System Prompt
      const promptStartTime = Date.now();
      const systemPrompt = this.promptManager.renderPrompt(
        agentConfig.prompt.systemPrompt,
        agentConfig.prompt.variables || [],
        context
      );
      await this.logStep(executionId, 'render_prompt', {
        type: 'prompt',
        input: { systemPrompt: agentConfig.prompt.systemPrompt, variables: agentConfig.prompt.variables, context },
        output: { systemPrompt },
        duration: Date.now() - promptStartTime,
        status: 'success'
      });

      // 5. 获取上下文消息
      checkTimeout();
      const contextStartTime = Date.now();
      const contextMessages = await this.contextManager.getContextMessages(
        finalConversationId,
        agentConfig.contextStrategy,
        query
      );
      await this.logStep(executionId, 'load_context', {
        type: 'context',
        input: { conversationId: finalConversationId, strategy: agentConfig.contextStrategy, query },
        output: { messageCount: contextMessages.length },
        duration: Date.now() - contextStartTime,
        status: 'success'
      });

      // 6. 构建完整消息列表
      const messages: ChatMessage[] = [];
      
      if (agentConfig.contextStrategy.includeSystemPrompt || contextMessages.length === 0) {
        messages.push({ role: 'system', content: systemPrompt });
      }

      messages.push(...contextMessages);
      messages.push({ role: 'user', content: query });

      // 7. 准备工具定义
      const tools = this.prepareTools(agentConfig.tools || []);

      // 8. 获取 LLM Provider
      const provider = this.config.dependencies.llmProviderFactory.create(agentConfig.llm);

      // 9. 调用 LLM（可能多轮工具调用）
      checkTimeout();
      const llmStartTime = Date.now();
      let response = await this.executeWithTools(
        provider,
        messages,
        agentConfig.llm,
        tools,
        agentConfig.tools || [],
        checkTimeout,
        executionId
      );
      const llmDuration = Date.now() - llmStartTime;
      
      await this.recordPerformanceMetrics(executionId, 'llm_call', llmDuration, response.usage);
      
      await this.logStep(executionId, 'llm_call', {
        type: 'llm',
        input: { messageCount: messages.length, toolCount: tools.length },
        output: { content: response.content, toolCalls: response.toolCalls?.length || 0 },
        duration: llmDuration,
        status: 'success'
      });

      // 10. 保存消息历史
      await this.saveMessages(finalConversationId, query, response, roleId);

      // 11. 返回结果
      const totalDuration = Date.now() - startTime;
      
      await this.recordPerformanceMetrics(executionId, 'execution_time', totalDuration, { 
        roleId, 
        toolCalls: response.toolCalls?.length || 0 
      });
      
      await this.logStep(executionId, 'complete', {
        type: 'complete',
        input: { query },
        output: { content: response.content },
        duration: totalDuration,
        status: 'success'
      });

      return {
        content: response.content,
        conversationId: finalConversationId,
        usage: response.usage,
        metadata: {
          model: response.model,
          finishReason: response.finishReason,
          toolCalls: response.toolCalls?.length || 0,
          executionId,
          toolCallsHistory: this.toolCallsHistory.length > 0 ? this.toolCallsHistory : undefined
        }
      };
    } catch (error) {
      const totalDuration = Date.now() - startTime;
      
      const agentError = AgentErrorHandler.normalizeError(error, {
        roleId,
        executionId,
        step: 'executeAgent'
      });
      
      await this.logStep(executionId, 'error', {
        type: 'error',
        input: { query, context },
        output: null,
        duration: totalDuration,
        status: 'failed',
        error: agentError.message,
        errorCode: agentError.code,
        errorDetails: agentError.details
      });
      
      throw agentError;
    } finally {
      this.currentExecutionId = '';
      this.currentAgentId = '';
      this.currentConversationId = '';
    }
  }

  /**
   * 执行带工具调用的 LLM 请求（可能多轮）
   */
  private async executeWithTools(
    provider: ILLMProvider,
    messages: ChatMessage[],
    llmConfig: LLMConfig,
    tools: Tool[],
    toolConfigs: ToolConfig[],
    checkTimeout?: () => void,
    executionId?: string
  ): Promise<LLMResponse> {
    let iteration = 0;
    let currentMessages = [...messages];
    let lastResponse: LLMResponse;

    while (iteration < this.maxToolCallIterations) {
      if (checkTimeout) checkTimeout();
      
      const response = await provider.chat(currentMessages, llmConfig, tools.length > 0 ? tools : undefined);
      lastResponse = response;

      if (checkTimeout) checkTimeout();

      if (!response.toolCalls || response.toolCalls.length === 0) {
        return response;
      }
      const responseToolCalls = response.toolCalls;

      currentMessages.push({
        role: 'assistant',
        content: response.content || ''
      });

      if (checkTimeout) checkTimeout();
      const toolStartTime = Date.now();
      
      const toolCallsInThisIteration = responseToolCalls.map((tc: any) => ({
        toolName: tc.function.name,
        status: 'running' as const
      }));
      this.toolCallsHistory.push(...toolCallsInThisIteration);
      
      const toolResults = await this.executeTools(
        responseToolCalls, 
        toolConfigs, 
        checkTimeout, 
        executionId,
        this.currentConversationId
      );
      
      toolResults.forEach((result, index) => {
        const toolCall = this.toolCallsHistory.find(tc => tc.toolName === responseToolCalls[index]?.function.name);
        if (toolCall) {
          try {
            const resultData = JSON.parse(result.content);
            if (resultData.error) {
              toolCall.status = 'error';
              toolCall.error = resultData.error;
            } else {
              toolCall.status = 'complete';
            }
          } catch {
            toolCall.status = 'complete';
          }
        }
      });
      
      if (executionId) {
        await this.logStep(executionId, `tool_execution_${iteration}`, {
          type: 'tool',
          input: { toolCalls: responseToolCalls },
          output: { results: toolResults },
          duration: Date.now() - toolStartTime,
          status: 'success'
        });
      }

      if (checkTimeout) checkTimeout();

      for (const result of toolResults) {
        currentMessages.push({
          role: 'tool',
          content: result.content,
          name: result.toolName,
          tool_call_id: result.toolCallId
        });
      }

      iteration++;
    }

    if (iteration >= this.maxToolCallIterations) {
      console.warn(`工具调用达到最大迭代次数: ${this.maxToolCallIterations}`);
    }

    return lastResponse!;
  }

  /**
   * 判断工具是否可以并行执行
   */
  private canExecuteInParallel(toolCalls: any[], toolConfigs: ToolConfig[]): boolean {
    if (toolCalls.length <= 1) {
      return false;
    }

    const types = toolCalls.map(tc => {
      const config = toolConfigs.find(c => c.name === tc.function.name);
      return config?.type;
    });

    const parallelSafeTypes = ['search', 'calculation', 'time', 'api'];
    return types.every(type => parallelSafeTypes.includes(type || ''));
  }

  /**
   * 执行单个工具调用
   */
  private async executeSingleTool(
    toolCall: any,
    toolConfig: ToolConfig,
    checkTimeout?: () => void,
    executionId?: string,
    conversationId?: string
  ): Promise<{ toolCallId: string; toolName: string; content: string }> {
    const TOOL_TIMEOUT = 60000;
    const toolCallStartTime = Date.now();

    try {
      if (checkTimeout) checkTimeout();

      const result = await Promise.race([
        this.toolExecutor.executeTool(toolCall, toolConfig, conversationId),
        new Promise<string>((_, reject) => 
          setTimeout(() => reject(new Error(`工具调用超时: ${toolCall.function.name} (${TOOL_TIMEOUT / 1000}秒)`)), TOOL_TIMEOUT)
        )
      ]);
      
      const toolDuration = Date.now() - toolCallStartTime;
      
      if (executionId) {
        await this.logStep(executionId, `tool_${toolCall.function.name}`, {
          type: 'tool_call',
          input: { toolName: toolCall.function.name, arguments: toolCall.function.arguments },
          output: { result },
          duration: toolDuration,
          status: 'success'
        });
      }

      return {
        toolCallId: toolCall.id,
        toolName: toolCall.function.name,
        content: result
      };
    } catch (error) {
      const toolDuration = Date.now() - toolCallStartTime;
      
      const agentError = AgentErrorHandler.normalizeError(error, {
        executionId,
        step: `tool_${toolCall.function.name}`
      });
      
      console.error(`工具执行失败: ${toolCall.function.name}`, agentError);
      
      if (executionId) {
        await this.logStep(executionId, `tool_${toolCall.function.name}_error`, {
          type: 'tool_call',
          input: { toolName: toolCall.function.name, arguments: toolCall.function.arguments },
          output: null,
          duration: toolDuration,
          status: 'failed',
          error: agentError.message,
          errorCode: agentError.code,
          errorDetails: agentError.details
        });
      }

      return {
        toolCallId: toolCall.id,
        toolName: toolCall.function.name,
        content: JSON.stringify({ 
          error: agentError.message,
          errorCode: agentError.code,
          recoverable: agentError.recoverable,
          toolName: toolCall.function.name,
          details: agentError.details
        })
      };
    }
  }

  /**
   * 执行多个工具调用
   */
  private async executeTools(
    toolCalls: any[],
    toolConfigs: ToolConfig[],
    checkTimeout?: () => void,
    executionId?: string,
    conversationId?: string
  ): Promise<Array<{ toolCallId: string; toolName: string; content: string }>> {
    const canParallel = this.canExecuteInParallel(toolCalls, toolConfigs);

    if (canParallel) {
      const promises = toolCalls.map(toolCall => {
        const config = toolConfigs.find(t => t.enabled && t.name === toolCall.function.name);
        
        if (!config) {
          return Promise.resolve({
            toolCallId: toolCall.id,
            toolName: toolCall.function.name,
            content: JSON.stringify({ error: `工具不存在或已禁用: ${toolCall.function.name}` })
          });
        }

        return this.executeSingleTool(toolCall, config, checkTimeout, executionId, conversationId);
      });

      return Promise.all(promises);
    } else {
      const results: Array<{ toolCallId: string; toolName: string; content: string }> = [];

      for (const toolCall of toolCalls) {
        if (checkTimeout) checkTimeout();
        
        const config = toolConfigs.find(t => t.enabled && t.name === toolCall.function.name);
        
        if (!config) {
          results.push({
            toolCallId: toolCall.id,
            toolName: toolCall.function.name,
            content: JSON.stringify({ error: `工具不存在或已禁用: ${toolCall.function.name}` })
          });
          continue;
        }

        const result = await this.executeSingleTool(toolCall, config, checkTimeout, executionId, conversationId);
        results.push(result);
      }

      return results;
    }
  }

  private prepareTools(toolConfigs: ToolConfig[]): Tool[] {
    return toolConfigs
      .filter(tool => tool.enabled)
      .map(tool => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: {
            type: 'object',
            properties: this.buildToolProperties(tool.parameters),
            required: tool.parameters
              .filter(p => p.required)
              .map(p => p.name)
          }
        }
      }));
  }

  private buildToolProperties(parameters: ToolConfig['parameters']): Record<string, any> {
    const properties: Record<string, any> = {};

    for (const param of parameters) {
      properties[param.name] = {
        type: param.type,
        description: param.description
      };

      if (param.enum) {
        properties[param.name].enum = param.enum;
      }

      if (param.default !== undefined) {
        properties[param.name].default = param.default;
      }
    }

    return properties;
  }

  private generateConversationId(): string {
    return `conv-${Date.now()}-${generateUUID()}`;
  }

  private async saveMessages(
    conversationId: string,
    userQuery: string,
    response: LLMResponse,
    roleId: string
  ): Promise<void> {
    try {
      await this.config.dependencies.chatMessageService.upsertConversation({
        conversation_id: conversationId,
        app_type: 'direct-agent',
        session_name: userQuery.substring(0, 50) + (userQuery.length > 50 ? '...' : ''),
        status: 'active'
      });

      const userMessageId = `user_${Date.now()}_${generateUUID()}`;
      await this.config.dependencies.chatMessageService.saveChatMessage({
        message_id: userMessageId,
        conversation_id: conversationId,
        message_type: 'user',
        content: userQuery,
        query: userQuery,
        app_type: 'direct-agent',
        status: 'completed'
      });

      const assistantMessageId = `assistant_${Date.now()}_${generateUUID()}`;
      await this.config.dependencies.chatMessageService.saveChatMessage({
        message_id: assistantMessageId,
        conversation_id: conversationId,
        message_type: 'assistant',
        content: response.content,
        app_type: 'direct-agent',
        prompt_tokens: response.usage.promptTokens,
        completion_tokens: response.usage.completionTokens,
        total_tokens: response.usage.totalTokens,
        status: 'completed'
      });
    } catch (error) {
      console.error('保存消息历史失败:', error);
    }
  }

  private async recordPerformanceMetrics(
    executionId: string, 
    metricType: string, 
    duration: number, 
    metadata?: any
  ): Promise<void> {
    try {
      await this.config.dependencies.performanceMetricModel.create({
        execution_id: executionId,
        metric_type: metricType,
        metric_name: `${metricType}_${executionId}`,
        value: duration,
        unit: 'ms',
        metadata
      });

      if (metadata?.totalTokens) {
        await this.config.dependencies.performanceMetricModel.create({
          execution_id: executionId,
          metric_type: 'token_usage',
          metric_name: `tokens_${executionId}`,
          value: metadata.totalTokens,
          unit: 'tokens',
          metadata
        });
      }
    } catch (error) {
      console.error('记录性能指标失败:', error);
    }
  }

  private async logStep(executionId: string, stepName: string, data: {
    type: string;
    input?: any;
    output?: any;
    duration: number;
    status: 'success' | 'failed' | 'skipped';
    error?: string;
    errorCode?: string;
    errorDetails?: any;
  }): Promise<void> {
    try {
      await this.config.dependencies.executionTraceModel.create({
        execution_id: executionId,
        agent_id: this.currentAgentId,
        step_name: stepName,
        step_type: data.type,
        input: data.input,
        output: data.output,
        duration: data.duration,
        status: data.status,
        metadata: { timestamp: new Date().toISOString() }
      });
    } catch (error) {
      console.error('记录执行步骤失败:', error);
    }
  }

  private async getMockResponse(roleId: string, query: string, context: Record<string, any>): Promise<AgentExecutionResult> {
    try {
      const role = await this.config.dependencies.roleModel.getById(roleId);
      const roleName = role?.name || 'AI助手';
      const roleDescription = role?.description || '';

      const mockContent = `[MOCK模式] 这是对"${query}"的模拟响应。

基于角色"${roleName}"的配置，我理解您的需求是：${query}

${roleDescription ? `角色描述：${roleDescription}\n\n` : ''}这是一个高质量的模拟回答。

上下文信息：${Object.keys(context).length > 0 ? JSON.stringify(context, null, 2) : '无'}`;

      return {
        content: mockContent,
        conversationId: `mock-${Date.now()}-${generateUUID()}`,
        usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
        metadata: { model: 'mock', finishReason: 'stop', toolCalls: 0, isMock: true }
      };
    } catch {
      return {
        content: `[MOCK模式] 这是对"${query}"的模拟响应。\n\n基于您的问题，我理解您的需求是：${query}\n\n这是一个模拟回答，实际使用时会调用真实的LLM服务。`,
        conversationId: `mock-${Date.now()}-${generateUUID()}`,
        usage: { promptTokens: 10, completionTokens: 50, totalTokens: 60 },
        metadata: { model: 'mock', finishReason: 'stop', toolCalls: 0, isMock: true }
      };
    }
  }
}
