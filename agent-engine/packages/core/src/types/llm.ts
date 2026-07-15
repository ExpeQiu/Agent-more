/**
 * LLM Provider 类型定义
 * 从 todify4 backend/services/llm/types.ts 提取并适配
 */

/**
 * 统一消息格式
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;        // tool调用时的函数名
  tool_call_id?: string;
}

/**
 * 工具定义（用于 Function Calling）
 */
export interface Tool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

/**
 * 工具调用结果
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;  // JSON字符串
  };
}

/**
 * LLM配置
 */
export interface LLMConfig {
  provider: 'openai' | 'azure-openai' | 'qwen' | 'ernie' | 'custom' | 'anthropic' | 'google' | 'local';
  apiKey: string;
  apiBaseUrl?: string;
  model: string;
  temperature: number;
  maxTokens: number;
  topP?: number;
  stream?: boolean;  // 是否使用流式响应
}

/**
 * LLM响应
 */
export interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
}

/**
 * LLM Provider 接口
 */
export interface ILLMProvider {
  /**
   * 发送聊天请求
   * @param messages 消息列表
   * @param config LLM配置
   * @param tools 可选的工具定义列表（用于 Function Calling）
   * @returns LLM响应
   */
  chat(messages: ChatMessage[], config: LLMConfig, tools?: Tool[]): Promise<LLMResponse>;
  
  /**
   * 测试连接
   * @returns 是否连接成功
   */
  testConnection(): Promise<boolean>;
}
