/**
 * Core Interfaces - 宿主应用需实现这些接口
 */

import type { ChatMessage } from '../types/llm';
import type { AIRoleRecord, AIRoleConfig, ExecutionTraceRecord, PerformanceMetricRecord } from '../types/agent';

/**
 * 角色模型接口
 */
export interface IRoleModel {
  getById(roleId: string): Promise<AIRoleRecord | null>;
  create?(record: Partial<AIRoleRecord>): Promise<AIRoleRecord>;
  update?(roleId: string, data: Partial<AIRoleRecord>): Promise<void>;
}

/**
 * 执行追踪模型接口
 */
export interface IExecutionTraceModel {
  create(trace: ExecutionTraceRecord): Promise<void>;
}

/**
 * 性能指标模型接口
 */
export interface IPerformanceMetricModel {
  create(metric: PerformanceMetricRecord): Promise<void>;
}

/**
 * 聊天消息服务接口
 */
export interface IChatMessageService {
  upsertConversation(params: {
    conversation_id: string;
    app_type: string;
    session_name: string;
    status: string;
  }): Promise<void>;
  
  saveChatMessage(msg: {
    message_id: string;
    conversation_id: string;
    message_type: string;
    content: string;
    query?: string;
    app_type: string;
    status: string;
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  }): Promise<void>;
  
  getConversationMessages(
    conversationId: string,
    limit: number,
    offset: number
  ): Promise<any[]>;
}

/**
 * LLM Provider 工厂接口
 */
export interface ILLMProviderFactory {
  create(llmConfig: any): import('../types/llm').ILLMProvider;
}

/**
 * Dify 客户端接口
 */
export interface IDifyClient {
  aiSearch(query: string, inputs: Record<string, any>, conversationId: string): Promise<any>;
}

/**
 * Dify Gateway 接口
 */
export interface IDifyGateway {
  executeChat(params: {
    query: string;
    conversationId?: string;
    inputs: Record<string, any>;
    userId: string;
  }): Promise<{
    success: boolean;
    value: { raw: any; answer?: string; conversationId?: string };
    error?: { message: string };
  }>;
  
  executeWorkflow(params: {
    workflowId: string;
    inputs: Record<string, any>;
    userId: string;
  }): Promise<{
    success: boolean;
    value: { raw: any };
    error?: { message: string };
  }>;
}

/**
 * Workflow 引擎接口
 */
export interface IWorkflowEngine {
  execute(workflow: any, params: { input: any }): Promise<any>;
}

/**
 * Agent 配置项（注入到 AgentOrchestrator）
 */
export interface AgentDependencies {
  roleModel: IRoleModel;
  executionTraceModel: IExecutionTraceModel;
  performanceMetricModel: IPerformanceMetricModel;
  chatMessageService: IChatMessageService;
  llmProviderFactory: ILLMProviderFactory;
  difyClient?: IDifyClient;
  difyGateway?: IDifyGateway;
  workflowEngine?: IWorkflowEngine;
}
