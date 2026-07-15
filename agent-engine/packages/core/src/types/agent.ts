/**
 * Agent 相关类型定义
 * 从 todify4 backend/models/AIRole.ts 提取并适配
 */

/**
 * Prompt变量定义
 */
export interface PromptVariable {
  name: string;
  description: string;
  type: 'static' | 'dynamic' | 'context';
  value?: string;
  source?: string;
}

/**
 * Prompt模板
 */
export interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  variables: string[];
}

/**
 * 工具参数定义
 */
export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  enum?: string[];
  default?: any;
}

/**
 * 工具配置
 */
export interface ToolConfig {
  id: string;
  name: string;
  description: string;
  type: 'search' | 'api' | 'calculation' | 'workflow' | 'agent' | 'time' | 'custom';
  enabled: boolean;
  parameters: ToolParameter[];
  implementation?: {
    endpoint?: string;
    method?: string;
    headers?: Record<string, string>;
    workflowId?: string;
    agentId?: string;
  };
}

/**
 * LLM配置（用于Agent配置，与 types/llm 中的 LLMConfig 兼容）
 */
export interface AgentLLMConfig {
  provider: 'openai' | 'azure-openai' | 'qwen' | 'ernie' | 'custom';
  apiKey: string;
  apiBaseUrl?: string;
  model: string;
  temperature: number;
  maxTokens: number;
  topP?: number;
  stream?: boolean;
}

/**
 * 上下文策略
 */
export interface ContextStrategy {
  type: 'window' | 'summary' | 'hybrid';
  maxMessages: number;
  maxTokens?: number;
  summaryThreshold?: number;
  includeSystemPrompt: boolean;
}

/**
 * Direct Agent配置
 */
export interface DirectAgentConfig {
  llm: AgentLLMConfig;
  prompt: {
    systemPrompt: string;
    variables?: PromptVariable[];
    templates?: PromptTemplate[];
  };
  contextStrategy: ContextStrategy;
  tools?: ToolConfig[];
  agentCalls?: any[];
}

/**
 * AI角色记录
 */
export interface AIRoleRecord {
  id: string;
  name: string;
  description: string;
  avatar?: string;
  system_prompt?: string;
  dify_config: string; // JSON
  enabled: number;
  source?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * AI角色配置
 */
export interface AIRoleConfig {
  id: string;
  name: string;
  description: string;
  avatar?: string;
  systemPrompt?: string;
  provider?: 'dify' | 'direct-agent';
  agentConfig?: DirectAgentConfig;
  enabled: boolean;
  source?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 执行追踪记录
 */
export interface ExecutionTraceRecord {
  execution_id: string;
  agent_id: string;
  step_name: string;
  step_type: string;
  input?: any;
  output?: any;
  duration: number;
  status: 'success' | 'failed' | 'skipped';
  error?: string;
  metadata?: any;
}

/**
 * 性能指标记录
 */
export interface PerformanceMetricRecord {
  execution_id: string;
  metric_type: string;
  metric_name: string;
  value: number;
  unit: string;
  metadata?: any;
}
