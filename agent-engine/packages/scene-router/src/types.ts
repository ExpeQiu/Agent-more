/**
 * Scene Router Types — P1-M5
 * 层级路由核心类型定义
 */

// ─── Chat Message ────────────────────────────────────────────────────────────

/** 统一消息格式 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
}

// ─── Scene Definition ────────────────────────────────────────────────────────

/** 场景元信息 */
export interface SceneDefinition {
  id: string;
  name: string;
  description: string;
  /** 触发词列表，用于 Layer 0 精确匹配 */
  triggerWords: string[];
  /** 规则匹配条件 */
  rules: SceneRule[];
  /** 场景描述文本，用于 Layer 2 向量匹配 */
  descriptionEmbedding?: number[];
  /** Few-shot 示例 */
  fewShotExamples?: FewShotExample[];
  /** 优先级（数字越小优先级越高） */
  priority?: number;
  /** 是否启用 */
  enabled: boolean;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/** 场景规则条件 */
export interface SceneRule {
  field: string;      // 匹配的字段，如 "query", "intent", "userType"
  operator: 'contains' | 'equals' | 'startsWith' | 'endsWith' | 'regex' | 'in' | 'gt' | 'lt';
  value: string | string[] | number | RegExp;
  /** 命中后加的置信度权重 */
  weight?: number;
}

/** Few-shot 示例 */
export interface FewShotExample {
  query: string;
  sceneId: string;
  label: 'positive' | 'negative';
}

// ─── Routing Request / Response ──────────────────────────────────────────────

/** 路由请求 */
export interface RoutingRequest {
  query: string;
  context?: RoutingContext;
  /** 可选的查询向量（由调用方预计算） */
  queryEmbedding?: number[];
  /** 期望的路由层级深度 */
  maxLayer?: 0 | 1 | 2 | 3;
}

/** 路由上下文 */
export interface RoutingContext {
  userId?: string;
  sessionId?: string;
  userType?: string;
  history?: string[];
  metadata?: Record<string, unknown>;
}

/** 路由响应 */
export interface RoutingResponse {
  sceneId: string;
  sceneName: string;
  confidence: number;          // 0.0 - 1.0
  layer: 0 | 1 | 2 | 3;         // 命中层级
  reasoning: string;           // 判断理由
  fallback: boolean;           // 是否为降级结果
  clarificationSuggestion?: string;  // 降级时的澄清建议
  metadata?: Record<string, unknown>;
  /** 各层级的置信度详情 */
  layerScores?: LayerScore[];
  /** 路由决策 ID（用于日志追踪） */
  decisionId?: string;
}

/** 各层级得分 */
export interface LayerScore {
  layer: 0 | 1 | 2 | 3;
  layerName: string;
  score: number;
  matched?: boolean;
  details?: string;
}

// ─── Route Decision Log（P1-T55 PostgreSQL 专用）────────────────────────────

/**
 * 路由日志条目（用于 PostgreSQL routing_logs 表）
 * 对应 task 要求：logDecision(decision: RouteDecisionLog)
 */
export interface RouteDecisionLog {
  executionId: string;
  inputQuery: string;
  matchedSceneId: string | null;
  confidence: number;
  layer: number;
  routingTimeMs: number;
}

// ─── Routing Decision Log ───────────────────────────────────────────────────

/** 路由决策日志（用于写入数据库） */
export interface RoutingDecisionLog {
  id: string;
  query: string;
  queryHash: string;           // query 的哈希，便于检索
  sceneId: string | null;      // null 表示降级
  confidence: number;
  layer: 0 | 1 | 2 | 3;
  fallback: boolean;
  reasoning: string;
  clarificationSuggestion?: string;
  layerScores: LayerScore[];
  context: RoutingContext;
  processingTimeMs: number;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

// ─── Qdrant Config ──────────────────────────────────────────────────────────

/** Qdrant 向量数据库配置 */
export interface QdrantConfig {
  url: string;
  apiKey?: string;
  collectionName: string;
  vectorSize: number;          // embedding 维度
}

// ─── LLM Router Config ──────────────────────────────────────────────────────

/** LLM 意图路由配置 */
export interface LLMIntentRouterConfig {
  provider: 'openai' | 'anthropic' | 'qwen' | 'ernie';
  model: string;
  apiKey: string;
  apiBaseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  /** confidence 上限 */
  confidenceCeiling: number;
}

// ─── Scene Router Config ────────────────────────────────────────────────────

/** 场景路由器配置 */
export interface SceneRouterConfig {
  /** 场景列表 */
  scenes: SceneDefinition[];
  /** Qdrant 配置（可选，用于 Layer 2） */
  qdrant?: QdrantConfig;
  /** LLM 路由配置（可选，用于 Layer 3） */
  llmIntent?: LLMIntentRouterConfig;
  /** 降级配置 */
  fallback?: FallbackConfig;
  /** 日志配置 */
  logger?: RoutingLoggerConfig;
  /** 默认场景（当所有层都未命中时使用） */
  defaultSceneId?: string;
}

/** 降级配置 */
export interface FallbackConfig {
  /** 置信度阈值，低于此值触发降级 */
  confidenceThreshold: number;
  /** 降级后的默认场景 ID */
  defaultSceneId: string;
  /** 澄清问题模板 */
  clarificationTemplate?: (query: string, suggestions: string[]) => string;
}

/** 日志配置 */
export interface RoutingLoggerConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 自定义日志写入函数 */
  writeLog?: (log: RoutingDecisionLog) => Promise<void>;
}
