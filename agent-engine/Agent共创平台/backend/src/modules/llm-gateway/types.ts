/**
 * 统一的 LLM 适配器接口
 * 所有多模型客户端必须实现此接口
 */
export interface LLMRequest {
  model: string
  messages: LLMMessage[]
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
}

export interface LLMResponse {
  content: string
  model: string
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
  latencyMs: number
  provider: string
}

/**
 * 统一适配器接口
 * 每个 provider 必须实现 supports() + chat() + chatStream()
 */
export interface LLMAdapter {
  readonly provider: string
  supports(model: string): boolean
  chat(request: LLMRequest): Promise<LLMResponse>
  chatStream(request: LLMRequest): AsyncGenerator<LLMStreamChunk, void, unknown>
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMStreamChunk {
  modelId?: string;
  content: string;
  done: boolean;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  error?: string;
}

export interface LLMClient {
  readonly modelId: string;
  readonly provider: string;
  
  /**
   * 流式聊天
   * @param apiModel API实际模型名（与modelId可能不同）
   * @param messages 消息列表
   */
  streamChat(apiModel: string, messages: LLMMessage[]): AsyncGenerator<LLMStreamChunk, void, unknown>;
}

export interface ModelConfig {
  id: string;           // 前端使用的ID
  apiName: string;      // API实际模型名
  provider: string;
  name: string;         // 显示名
  description?: string;
  contextWindow?: number;
}

/**
 * 可用模型列表（Phase 1 对应合并方案 §8.2 第一批模型）
 * 与前端 frontend/src/features/ai-chat/lib/models.ts 保持同步
 */
export const AVAILABLE_MODELS: ModelConfig[] = [
  // ── OpenAI ──────────────────────────────────────────────────────────────────
  {
    id: 'gpt-4o',
    apiName: 'gpt-4o',
    provider: 'openai',
    name: 'GPT-4o',
    description: 'OpenAI 旗舰多模态模型',
    contextWindow: 128000,
  },
  {
    id: 'gpt-4o-mini',
    apiName: 'gpt-4o-mini',
    provider: 'openai',
    name: 'GPT-4o Mini',
    description: 'OpenAI 高性价比模型',
    contextWindow: 128000,
  },
  {
    id: 'o3',
    apiName: 'o3',
    provider: 'openai',
    name: 'OpenAI o3',
    description: 'OpenAI 推理模型（测试版）',
    contextWindow: 200000,
  },
  {
    id: 'o4-mini',
    apiName: 'o4-mini',
    provider: 'openai',
    name: 'OpenAI o4-mini',
    description: 'OpenAI 轻量推理模型（测试版）',
    contextWindow: 100000,
  },

  // ── Anthropic ───────────────────────────────────────────────────────────────
  {
    id: 'claude-4.6-sonnet',
    apiName: 'claude-4-6-sonnet-20251120',
    provider: 'anthropic',
    name: 'Claude 4.6 Sonnet',
    description: 'Anthropic 最新旗舰模型',
    contextWindow: 200000,
  },
  {
    id: 'claude-4.5-opus',
    apiName: 'claude-4-5-opus-20251120',
    provider: 'anthropic',
    name: 'Claude 4.5 Opus',
    description: 'Anthropic 最强推理模型',
    contextWindow: 200000,
  },
  {
    id: 'claude-4.5-sonnet',
    apiName: 'claude-4-5-sonnet-20251120',
    provider: 'anthropic',
    name: 'Claude 4.5 Sonnet',
    description: 'Anthropic 高性价比旗舰',
    contextWindow: 200000,
  },
  {
    id: 'claude-3.7-sonnet',
    apiName: 'claude-3-7-sonnet-20250620',
    provider: 'anthropic',
    name: 'Claude 3.7 Sonnet',
    description: 'Anthropic 扩展思考模型',
    contextWindow: 200000,
  },
  {
    id: 'claude-3.5-opus',
    apiName: 'claude-3-5-opus-20241120',
    provider: 'anthropic',
    name: 'Claude 3.5 Opus',
    description: 'Anthropic 上代最强模型',
    contextWindow: 200000,
  },
  {
    id: 'claude-3.5-sonnet',
    apiName: 'claude-3-5-sonnet-20241022',
    provider: 'anthropic',
    name: 'Claude 3.5 Sonnet',
    description: 'Anthropic 主力高性价比模型',
    contextWindow: 200000,
  },

  // ── DeepSeek ────────────────────────────────────────────────────────────────
  {
    id: 'deepseek-chat',
    apiName: 'deepseek-chat',
    provider: 'deepseek',
    name: 'DeepSeek Chat',
    description: 'DeepSeek 通用对话模型，代码能力强',
    contextWindow: 64000,
  },
  {
    id: 'deepseek-reasoner',
    apiName: 'deepseek-reasoner',
    provider: 'deepseek',
    name: 'DeepSeek Reasoner',
    description: 'DeepSeek 推理模型，复杂问题深度思考',
    contextWindow: 64000,
  },

  // ── GLM (智谱) ──────────────────────────────────────────────────────────────
  {
    id: 'glm-4-plus',
    apiName: 'glm-4-plus',
    provider: 'glm',
    name: 'GLM-4 Plus',
    description: '智谱 AI 旗舰模型，中文能力强',
    contextWindow: 128000,
  },
  {
    id: 'glm-4',
    apiName: 'glm-4',
    provider: 'glm',
    name: 'GLM-4',
    description: '智谱 AI 高性价比版本',
    contextWindow: 128000,
  },
  {
    id: 'glm-3',
    apiName: 'glm-3',
    provider: 'glm',
    name: 'GLM-3',
    description: '智谱 AI 基础模型',
    contextWindow: 32000,
  },

  // ── Google Gemini ──────────────────────────────────────────────────────────
  {
    id: 'gemini-2.5-pro',
    apiName: 'gemini-2.5-pro-preview-06-05',
    provider: 'google',
    name: 'Gemini 2.5 Pro',
    description: 'Google 旗舰多模态模型，超大上下文',
    contextWindow: 1000000,
  },
  {
    id: 'gemini-2.5-flash',
    apiName: 'gemini-2.5-flash-preview-06-05',
    provider: 'google',
    name: 'Gemini 2.5 Flash',
    description: 'Google 高性价比多模态模型',
    contextWindow: 1000000,
  },
  {
    id: 'gemini-2.0-flash',
    apiName: 'gemini-2.0-flash',
    provider: 'google',
    name: 'Gemini 2.0 Flash',
    description: 'Google 轻量快速模型',
    contextWindow: 1000000,
  },

  // ── DashScope (阿里百炼/Qwen) ───────────────────────────────────────────────
  {
    id: 'qwen3.5-72b',
    apiName: 'qwen3.5-72b',
    provider: 'dashscope',
    name: 'Qwen 3.5 72B',
    description: '阿里通义千问 720 亿参数旗舰',
    contextWindow: 32000,
  },
  {
    id: 'qwen3.5-32b',
    apiName: 'qwen3.5-32b',
    provider: 'dashscope',
    name: 'Qwen 3.5 32B',
    description: '阿里通义千问 320 亿参数',
    contextWindow: 32000,
  },
  {
    id: 'qwen3.5-9b',
    apiName: 'qwen3.5-9b',
    provider: 'dashscope',
    name: 'Qwen 3.5 9B',
    description: '阿里通义千问 90 亿参数',
    contextWindow: 32000,
  },
  {
    id: 'qwen3-30b',
    apiName: 'qwen3-30b',
    provider: 'dashscope',
    name: 'Qwen 3 30B',
    description: '阿里通义千问 300 亿参数',
    contextWindow: 32000,
  },
  {
    id: 'qwen-coder-9b',
    apiName: 'qwen-coder-9b',
    provider: 'dashscope',
    name: 'Qwen Coder 9B',
    description: '阿里通义编程模型',
    contextWindow: 32000,
  },

  // ── MiniMax ─────────────────────────────────────────────────────────────────
  {
    id: 'abab6.5-chat',
    apiName: 'abab6.5-chat',
    provider: 'minimax',
    name: 'MiniMax abab6.5 Chat',
    description: 'MiniMax 旗舰对话模型',
    contextWindow: 245760,
  },
  {
    id: 'abab6.5s-chat',
    apiName: 'abab6.5s-chat',
    provider: 'minimax',
    name: 'MiniMax abab6.5s Chat',
    description: 'MiniMax 高速对话模型',
    contextWindow: 245760,
  },
  {
    id: 'M2.5',
    apiName: 'M2.5',
    provider: 'minimax',
    name: 'MiniMax M2.5',
    description: 'MiniMax 最新一代模型',
    contextWindow: 245760,
  },

  // ── Ollama (本地) ───────────────────────────────────────────────────────────
  {
    id: 'qwen3.5:9b',
    apiName: 'qwen3.5:9b',
    provider: 'ollama',
    name: 'Qwen 3.5 9B (Ollama)',
    description: '本地 Ollama 部署，需配置 OLLAMA_BASE_URL',
    contextWindow: 32000,
  },
];
