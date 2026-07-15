/**
 * Scene Router Usage Examples
 * P1-M5: 示例代码
 */

// Declare console for environments without @types/node
declare const console: {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
};

import {
  SceneRouter,
  createSceneRouter,
  type SceneDefinition,
  type RoutingRequest,
} from './index.js';

// ─── 示例场景定义 ───────────────────────────────────────────────────────────

const scenes: SceneDefinition[] = [
  {
    id: 'scene-coding',
    name: 'Coding Assistant',
    description: 'AI coding assistant for code writing, debugging, and refactoring',
    triggerWords: ['代码', '写代码', 'debug', 'refactor', '函数', 'class'],
    rules: [
      { field: 'query', operator: 'contains', value: 'bug', weight: 0.1 },
      { field: 'query', operator: 'contains', value: 'error', weight: 0.1 },
    ],
    enabled: true,
    priority: 1,
  },
  {
    id: 'scene-tech-packaging',
    name: 'Tech Packaging',
    description: 'Technical promotion and packaging for automotive products',
    triggerWords: ['技术包装', '技术亮点', '技术传播', 'tech packaging'],
    rules: [
      { field: 'userType', operator: 'equals', value: 'tpd', weight: 0.2 },
    ],
    enabled: true,
    priority: 2,
  },
  {
    id: 'scene-pm',
    name: 'Product Management',
    description: 'Product requirement analysis and sprint planning',
    triggerWords: ['需求', 'PRD', '产品', 'sprint', 'backlog'],
    rules: [],
    enabled: true,
    priority: 3,
  },
  {
    id: 'scene-qa',
    name: 'QA Testing',
    description: 'Quality assurance and test case management',
    triggerWords: ['测试', 'test case', 'bug report', 'QA'],
    rules: [],
    enabled: true,
    priority: 4,
  },
];

// ─── 示例 1: 基础使用 ───────────────────────────────────────────────────────

async function basicExample() {
  const router = createSceneRouter(scenes);

  const request: RoutingRequest = {
    query: '帮我写一个排序算法',
  };

  const response = await router.route(request);

  console.log('=== Basic Example ===');
  console.log('Scene:', response.sceneName);
  console.log('Confidence:', response.confidence);
  console.log('Layer:', response.layer);
  console.log('Reasoning:', response.reasoning);
  console.log();
}

// ─── 示例 2: 带上下文的路由 ─────────────────────────────────────────────────

async function contextualExample() {
  const router = createSceneRouter(scenes, {
    fallback: {
      confidenceThreshold: 0.5,
      defaultSceneId: 'scene-coding',
    },
  });

  const request: RoutingRequest = {
    query: '这个函数报错了',
    context: {
      userId: 'user-123',
      sessionId: 'session-456',
      userType: 'developer',
    },
  };

  const response = await router.route(request);

  console.log('=== Contextual Example ===');
  console.log('Scene:', response.sceneName);
  console.log('Confidence:', response.confidence);
  console.log('Fallback:', response.fallback);
  console.log();
}

// ─── 示例 3: 带 Qdrant + LLM 的完整路由 ─────────────────────────────────────

async function fullLayeredExample() {
  const router = new SceneRouter({
    scenes,
    qdrant: {
      url: 'http://localhost:6333',
      collectionName: 'scene-descriptions',
      vectorSize: 1536,
    },
    llmIntent: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: process.env.OPENAI_API_KEY ?? '',
      confidenceCeiling: 0.85,
    },
    fallback: {
      confidenceThreshold: 0.5,
      defaultSceneId: 'scene-coding',
    },
    logger: {
      enabled: true,
    },
  });

  // 初始化（上传向量到 Qdrant）
  await router.initialize();

  const request: RoutingRequest = {
    query: '我想要一个能自动分析销售数据的技术推广方案',
  };

  const response = await router.route(request);

  console.log('=== Full Layered Example ===');
  console.log('Scene:', response.sceneName);
  console.log('Confidence:', response.confidence);
  console.log('Matched Layer:', response.layer);
  console.log('Reasoning:', response.reasoning);
  console.log('Layer Scores:', JSON.stringify(response.layerScores, null, 2));
  console.log();
}

// ─── 示例 4: 批量路由测试 ───────────────────────────────────────────────────

async function batchExample() {
  const router = createSceneRouter(scenes);

  const queries = [
    '帮我写一个快速排序',
    '技术亮点怎么提炼',
    '这个bug怎么修',
    '写个测试用例',
    '随便聊聊',
  ];

  console.log('=== Batch Example ===');
  for (const query of queries) {
    const response = await router.route({ query });
    console.log(`Query: "${query}"`);
    console.log(`  → Scene: ${response.sceneName} (conf: ${response.confidence}, layer: ${response.layer})`);
    console.log();
  }
}

// 运行示例
basicExample().catch(console.error);
