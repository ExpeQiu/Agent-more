/**
 * 工具执行器
 * 从 todify4 backend/services/agent/ToolExecutor.ts 移植
 * 负责执行各种类型的工具调用
 */
import type { ToolCall, ILLMProvider } from '../types/llm';
import type { ToolConfig } from '../types/agent';
import type { ToolExecutionResult } from './types';
import type { IRoleModel, IDifyClient, IDifyGateway, IWorkflowEngine, ILLMProviderFactory } from '../interfaces';
import { toolCallEventManager } from '../events/ToolCallEventManager';

/**
 * 专家工具名称到角色ID的映射
 */
export const toolToRoleMapping: Record<string, string> = {
  'Consult_Tech': 'tech-fundamentalist',
  'Consult_Scene': 'scene-alchemist',
  'Consult_Market': 'market-sniper',
  'Consult_Content': 'content-director'
};

/**
 * 工具名称到功能类型的映射
 */
export const toolToFeatureTypeMapping: Record<string, string> = {
  'Consult_Tech': 'five-view-analysis',
  'Consult_Scene': 'tech-matrix',
  'Consult_Market': 'propagation-strategy',
  'Consult_Content': 'script'
};

export interface ToolExecutorConfig {
  roleModel: IRoleModel;
  difyClient?: IDifyClient;
  difyGateway?: IDifyGateway;
  workflowEngine?: IWorkflowEngine;
  llmProviderFactory: ILLMProviderFactory;
  // Optional runtime dependencies (injected by host app)
  mathjs?: { evaluate: (expr: string) => any };
  axios?: any;
}

export class ToolExecutor {
  private config: ToolExecutorConfig;

  constructor(config: ToolExecutorConfig) {
    this.config = config;
  }

  /**
   * 执行工具调用
   */
  async executeTool(
    toolCall: ToolCall,
    toolConfig: ToolConfig,
    conversationId?: string
  ): Promise<string> {
    const toolName = toolConfig.name;
    
    if (conversationId) {
      toolCallEventManager.emitToolStart(conversationId, toolName, toolConfig.id, {
        arguments: toolCall.function.arguments
      });
    }

    try {
      const args = JSON.parse(toolCall.function.arguments || '{}');
      this.validateParameters(args, toolConfig.parameters);

      let result: ToolExecutionResult;

      switch (toolConfig.type) {
        case 'search':
          result = await this.executeSearch(args);
          break;

        case 'calculation':
          result = this.executeCalculation(args);
          break;

        case 'time':
          result = this.getTime(args);
          break;

        case 'api':
          result = await this.executeAPI(toolConfig, args);
          break;

        case 'workflow':
          result = await this.executeWorkflow(toolConfig, args);
          break;

        case 'agent':
          result = await this.executeAgent(toolConfig, args, conversationId);
          break;

        default:
          result = {
            success: false,
            content: JSON.stringify({ error: `不支持的工具类型: ${toolConfig.type}` })
          };
      }

      if (!result.success) {
        if (conversationId) {
          toolCallEventManager.emitToolError(conversationId, toolName, result.error || '工具执行失败');
        }
        return JSON.stringify({ error: result.error || '工具执行失败' });
      }

      if (conversationId) {
        try {
          const resultData = JSON.parse(result.content);
          toolCallEventManager.emitToolComplete(conversationId, toolName, resultData);
        } catch {
          toolCallEventManager.emitToolComplete(conversationId, toolName, { content: result.content });
        }
      }

      return result.content;
    } catch (error) {
      console.error(`工具执行失败: ${toolConfig.name}`, error);
      
      if (conversationId) {
        toolCallEventManager.emitToolError(
          conversationId, 
          toolName, 
          error instanceof Error ? error.message : '工具执行失败'
        );
      }
      
      return JSON.stringify({
        error: error instanceof Error ? error.message : '工具执行失败'
      });
    }
  }

  private validateParameters(args: any, parameters: ToolConfig['parameters']): void {
    for (const param of parameters) {
      if (param.required && (args[param.name] === undefined || args[param.name] === null)) {
        throw new Error(`缺少必需参数: ${param.name}`);
      }

      if (args[param.name] !== undefined) {
        const value = args[param.name];
        const expectedType = param.type;

        switch (expectedType) {
          case 'string':
            if (typeof value !== 'string') {
              throw new Error(`参数 ${param.name} 必须是字符串类型`);
            }
            break;
          case 'number':
            if (typeof value !== 'number') {
              throw new Error(`参数 ${param.name} 必须是数字类型`);
            }
            break;
          case 'boolean':
            if (typeof value !== 'boolean') {
              throw new Error(`参数 ${param.name} 必须是布尔类型`);
            }
            break;
          case 'array':
            if (!Array.isArray(value)) {
              throw new Error(`参数 ${param.name} 必须是数组类型`);
            }
            break;
          case 'object':
            if (typeof value !== 'object' || Array.isArray(value) || value === null) {
              throw new Error(`参数 ${param.name} 必须是对象类型`);
            }
            break;
        }

        if (param.enum && !param.enum.includes(String(value))) {
          throw new Error(`参数 ${param.name} 的值必须是以下之一: ${param.enum.join(', ')}`);
        }
      }
    }
  }

  private async executeSearch(args: any): Promise<ToolExecutionResult> {
    if (!this.config.difyClient) {
      return { success: false, content: JSON.stringify({ error: 'DifyClient 未配置' }) };
    }

    try {
      const query = args.query || '';
      const limit = args.limit || 10;
      const filters = args.filters || {};
      const conversationId = args.conversationId || '';

      if (!query) {
        return { success: false, content: JSON.stringify({ error: '搜索查询不能为空' }) };
      }

      const result = await this.config.difyClient.aiSearch(query, { ...filters, limit }, conversationId);

      const searchResults = {
        query,
        answer: result.answer || '',
        results: result.metadata?.retriever_resources || [],
        count: result.metadata?.retriever_resources?.length || 0,
        sources: (result.metadata?.retriever_resources || []).map((resource: any) => ({
          document: resource.document_name || resource.document_id,
          dataset: resource.dataset_name || resource.dataset_id,
          content: resource.content,
          score: resource.score,
          position: resource.position
        })),
        conversationId: result.conversation_id || conversationId,
        usage: result.metadata?.usage || {}
      };

      return { success: true, content: JSON.stringify(searchResults) };
    } catch (error) {
      return {
        success: false,
        content: JSON.stringify({ 
          error: error instanceof Error ? error.message : '搜索失败',
          query: args.query || ''
        })
      };
    }
  }

  private executeCalculation(args: any): ToolExecutionResult {
    try {
      const expression = args.expression || '';

      if (!expression) {
        return { success: false, content: JSON.stringify({ error: '计算表达式不能为空' }) };
      }

      // 使用 mathjs 进行安全的数学计算
      // mathjs 可以通过 config.mathjs 注入，或通过动态 import 获取
      let evaluate: (expr: string) => any;
      if (this.config.mathjs) {
        evaluate = this.config.mathjs.evaluate;
      } else {
        // 尝试动态 import
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const mathjs = ((globalThis as any).require || (window as any).require)('mathjs');
          evaluate = mathjs.evaluate;
        } catch {
          return { success: false, content: JSON.stringify({ error: 'mathjs 未安装，请在配置中注入 mathjs' }) };
        }
      }

      const result = evaluate(expression);

      if (typeof result !== 'number' || !isFinite(result)) {
        return { success: false, content: JSON.stringify({ error: '计算结果不是有效数字', result }) };
      }

      return { success: true, content: JSON.stringify({ expression, result }) };
    } catch (error) {
      return {
        success: false,
        content: JSON.stringify({ 
          error: '表达式计算失败: ' + (error instanceof Error ? error.message : '未知错误'),
          expression: args.expression
        })
      };
    }
  }

  private getTime(args: any): ToolExecutionResult {
    try {
      const format = args.format || 'iso';
      const timezone = args.timezone || 'Asia/Shanghai';

      const now = new Date();
      let result: any = {};

      switch (format) {
        case 'iso':
          result.iso = now.toISOString();
          result.local = now.toLocaleString('zh-CN', { timeZone: timezone });
          break;
        case 'timestamp':
          result.timestamp = now.getTime();
          result.unix = Math.floor(now.getTime() / 1000);
          break;
        case 'date':
          result.date = now.toLocaleDateString('zh-CN', { timeZone: timezone });
          result.year = now.getFullYear();
          result.month = now.getMonth() + 1;
          result.day = now.getDate();
          break;
        case 'time':
          result.time = now.toLocaleTimeString('zh-CN', { timeZone: timezone });
          result.hour = now.getHours();
          result.minute = now.getMinutes();
          result.second = now.getSeconds();
          break;
        default:
          result = {
            iso: now.toISOString(),
            timestamp: now.getTime(),
            local: now.toLocaleString('zh-CN', { timeZone: timezone })
          };
      }

      result.timezone = timezone;
      result.format = format;

      return { success: true, content: JSON.stringify(result) };
    } catch (error) {
      return { success: false, content: JSON.stringify({ error: error instanceof Error ? error.message : '获取时间失败' }) };
    }
  }

  private async executeAPI(toolConfig: ToolConfig, args: any): Promise<ToolExecutionResult> {
    try {
      const implementation = toolConfig.implementation;
      if (!implementation?.endpoint) {
        return { success: false, content: JSON.stringify({ error: 'API 端点未配置' }) };
      }

      const method = (implementation.method || 'POST').toUpperCase();
      const url = implementation.endpoint;
      const headers = implementation.headers || {};

      let axiosLib: any;
      if (this.config.axios) {
        axiosLib = this.config.axios;
      } else {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          axiosLib = ((globalThis as any).require || (window as any).require)('axios');
        } catch {
          return { success: false, content: JSON.stringify({ error: 'axios 未安装，请在配置中注入 axios' }) };
        }
      }

      let response: any;
      switch (method) {
        case 'GET':
          response = await axiosLib.get(url, { headers, params: args, timeout: 30000 });
          break;
        case 'POST':
          response = await axiosLib.post(url, args, { headers, timeout: 30000 });
          break;
        case 'PUT':
          response = await axiosLib.put(url, args, { headers, timeout: 30000 });
          break;
        case 'DELETE':
          response = await axiosLib.delete(url, { headers, params: args, timeout: 30000 });
          break;
        default:
          return { success: false, content: JSON.stringify({ error: `不支持的 HTTP 方法: ${method}` }) };
      }

      return { success: true, content: JSON.stringify(response.data) };
    } catch (error: any) {
      if (error?.response) {
        const status = error.response.status || 'N/A';
        const message = error.response.data?.message || error.message;
        return { success: false, content: JSON.stringify({ error: `API 调用失败 (${status}): ${message}` }) };
      }
      return { success: false, content: JSON.stringify({ error: error instanceof Error ? error.message : 'API 调用失败' }) };
    }
  }

  private async executeWorkflow(toolConfig: ToolConfig, args: any): Promise<ToolExecutionResult> {
    if (!this.config.workflowEngine) {
      return { success: false, content: JSON.stringify({ error: 'WorkflowEngine 未配置' }) };
    }

    try {
      const implementation = toolConfig.implementation;
      if (!implementation?.workflowId) {
        return { success: false, content: JSON.stringify({ error: 'Workflow ID 未配置' }) };
      }

      const result = await this.config.workflowEngine.execute(
        { id: implementation.workflowId },
        { input: args.inputs || args }
      );

      const output = result.data?.outputs || result.message || result;
      return { success: true, content: JSON.stringify(output) };
    } catch (error) {
      return { success: false, content: JSON.stringify({ error: error instanceof Error ? error.message : 'Workflow 执行失败' }) };
    }
  }

  private async executeAgent(
    toolConfig: ToolConfig,
    args: any,
    conversationId?: string
  ): Promise<ToolExecutionResult> {
    try {
      const implementation = toolConfig.implementation;
      const isExpertTool = toolConfig.name && (
        toolConfig.name.startsWith('Consult_') ||
        toolToRoleMapping[toolConfig.name]
      );

      let targetAgentId: string | null = null;

      if (isExpertTool && toolConfig.name) {
        targetAgentId = toolToRoleMapping[toolConfig.name] ?? implementation?.agentId ?? null;
      } else {
        if (!implementation?.agentId) {
          return { success: false, content: JSON.stringify({ error: 'Agent ID 未配置' }) };
        }
        targetAgentId = implementation.agentId;
      }

      if (!targetAgentId) {
        return { success: false, content: JSON.stringify({ error: '无法确定目标 Agent ID' }) };
      }

      // 构建查询
      let query = args.query || args.input || '';
      if (!query) {
        query = this.buildQueryFromArgs(toolConfig.name, args);
      }

      // 检查嵌套深度
      const maxDepth = 3;
      const currentDepth = args._callDepth || 0;
      if (currentDepth >= maxDepth) {
        return {
          success: false,
          content: JSON.stringify({ 
            error: `Agent嵌套调用深度超过限制: ${maxDepth}`,
            currentDepth,
            maxDepth
          })
        };
      }

      // 获取 Agent 配置
      const agent = await this.config.roleModel.getById(targetAgentId);
      if (!agent || !agent.enabled) {
        return { success: false, content: JSON.stringify({ error: `Agent 不存在或已禁用: ${targetAgentId}` }) };
      }

      // 解析配置判断 provider 类型
      let agentConfig: any;
      try {
        agentConfig = JSON.parse(agent.dify_config || '{}');
      } catch {
        return { success: false, content: JSON.stringify({ error: `Agent 配置解析失败: ${targetAgentId}` }) };
      }

      if (agentConfig.provider === 'direct-agent') {
        // Direct Agent - 返回指令供宿主应用执行
        return {
          success: true,
          content: JSON.stringify({
            _direct_agent: true,
            agentId: targetAgentId,
            query,
            context: {
              ...args,
              _callDepth: currentDepth + 1,
              _toolName: toolConfig.name,
              _toolType: toolConfig.type
            }
          })
        };
      } else if (agentConfig.provider === 'dify' || !agentConfig.provider) {
        // Dify Agent
        if (!this.config.difyGateway) {
          return { success: false, content: JSON.stringify({ error: 'DifyGateway 未配置' }) };
        }
        return await this.executeDifyAgent(agentConfig, query, args);
      } else {
        return {
          success: false,
          content: JSON.stringify({ 
            error: `Agent ${targetAgentId} 的 provider 类型不支持: ${agentConfig.provider}`,
            provider: agentConfig.provider
          })
        };
      }
    } catch (error) {
      return {
        success: false,
        content: JSON.stringify({ 
          error: error instanceof Error ? error.message : 'Agent 调用失败',
          details: error instanceof Error ? error.stack : String(error)
        })
      };
    }
  }

  private buildQueryFromArgs(toolName: string, args: any): string {
    if (toolName === 'Consult_Tech') {
      const techDoc = args.techDocument || '';
      const analysisType = args.analysisType || '';
      if (techDoc) {
        return analysisType 
          ? `请进行${analysisType === 'five-view' ? '五看分析' : analysisType === 'three-fix' ? '三定分析' : '技术矩阵分析'}：\n\n${techDoc}`
          : `请分析以下技术文档：\n\n${techDoc}`;
      }
      return '请分析技术文档';
    } else if (toolName === 'Consult_Scene') {
      const techPoint = args.techPoint || '';
      const userContext = args.userContext || '';
      return techPoint 
        ? `请分析技术点"${techPoint}"的用户场景${userContext ? `，用户画像：${userContext}` : ''}`
        : '请分析用户场景';
    } else if (toolName === 'Consult_Market') {
      const parts: string[] = [];
      if (args.techDescription) parts.push(`技术描述：${args.techDescription}`);
      if (args.targetAudience) parts.push(`目标人群：${args.targetAudience}`);
      if (args.competitors) parts.push(`竞品信息：${args.competitors}`);
      return parts.length > 0 ? `请分析市场策略：\n${parts.join('\n')}` : '请分析市场策略';
    } else if (toolName === 'Consult_Content') {
      const parts: string[] = [];
      if (args.strategy) parts.push(`传播策略：${args.strategy}`);
      if (args.materials) parts.push(`已有素材：${args.materials}`);
      const contentType = args.contentType || 'script';
      return parts.length > 0
        ? `请生成${contentType === 'script' ? '脚本' : contentType === 'ppt-outline' ? 'PPT大纲' : contentType === 'poster' ? '海报文案' : '视频分镜'}：\n${parts.join('\n')}`
        : `请生成${contentType === 'script' ? '脚本' : '内容'}`;
    }
    
    const meaningfulArgs = Object.entries(args)
      .filter(([key]) => !key.startsWith('_') && args[key])
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
    return meaningfulArgs || JSON.stringify(args);
  }

  private async executeDifyAgent(
    agentConfig: any,
    query: string,
    args: any
  ): Promise<ToolExecutionResult> {
    if (!this.config.difyGateway) {
      return { success: false, content: JSON.stringify({ error: 'DifyGateway 未配置' }) };
    }

    try {
      const { apiUrl, apiKey, connectionType } = agentConfig;
      const conversationId = args.conversationId || '';

      if (connectionType === 'chatflow') {
        const chatResult = await this.config.difyGateway.executeChat({
          query,
          conversationId,
          inputs: { ...args },
          userId: 'expert-tool',
        });

        if (chatResult.success) {
          const chatData = chatResult.value.raw as any;
          return {
            success: true,
            content: JSON.stringify({
              content: chatData.answer || chatResult.value.answer || '',
              conversationId: chatData.conversation_id || chatResult.value.conversationId || conversationId,
              metadata: chatData.metadata || {}
            })
          };
        } else {
          return { success: false, content: JSON.stringify({ error: chatResult.error?.message || 'Dify 聊天调用失败' }) };
        }
      } else {
        const workflowResult = await this.config.difyGateway.executeWorkflow({
          workflowId: 'custom-workflow',
          inputs: { query, ...args },
          userId: 'expert-tool',
        });

        if (workflowResult.success) {
          const workflowData = workflowResult.value.raw as any;
          return {
            success: true,
            content: JSON.stringify({
              content: workflowData.data?.outputs?.text || workflowData.data?.outputs?.answer || '',
              conversationId: workflowData.conversation_id || conversationId,
              metadata: workflowData.metadata || {}
            })
          };
        } else {
          return { success: false, content: JSON.stringify({ error: workflowResult.error?.message || 'Dify Workflow 调用失败' }) };
        }
      }
    } catch (error) {
      return {
        success: false,
        content: JSON.stringify({ 
          error: error instanceof Error ? error.message : 'Dify Agent 调用失败',
          details: error instanceof Error ? error.stack : String(error)
        })
      };
    }
  }
}
