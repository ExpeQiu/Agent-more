/**
 * Hybrid Match — Layer 2 向量混合匹配
 * P1-T51: Qdrant 集成，场景描述 embedding vs 查询 embedding 余弦相似度 > 0.6 视为有效匹配
 */

import type {
  SceneDefinition,
  RoutingRequest,
  RoutingResponse,
  LayerScore,
  QdrantConfig,
} from './types.js';

// ─── 向量工具 ───────────────────────────────────────────────────────────────

/**
 * 计算余弦相似度
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * 生成简单的文本 embedding（基于词频统计的简陋实现）
 * 实际项目中应使用 OpenAI text-embedding-3-small 或其他专业 embedding 服务
 */
export async function generateTextEmbedding(
  text: string,
  dimensions: number = 1536
): Promise<number[]> {
  // 简单的词袋模型生成伪 embedding
  // 生产环境应替换为真正的 embedding API
  const words = text.toLowerCase().split(/\s+/);
  const embedding = new Array(dimensions).fill(0);

  // 使用 hash + 模运算将词映射到向量维度
  for (const word of words) {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = ((hash << 5) - hash) + word.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    const index = Math.abs(hash) % dimensions;
    embedding[index] += 1;
  }

  // L2 归一化
  const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < dimensions; i++) {
      embedding[i] /= norm;
    }
  }

  return embedding;
}

// ─── Qdrant Client ──────────────────────────────────────────────────────────

/**
 * Qdrant REST Client
 * 用于场景描述向量的存储和相似度搜索
 */
export class QdrantClient {
  private url: string;
  private apiKey?: string;
  private collectionName: string;
  private vectorSize: number;

  constructor(config: QdrantConfig) {
    this.url = config.url.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.collectionName = config.collectionName;
    this.vectorSize = config.vectorSize;
  }

  /**
   * 检查 collection 是否存在，不存在则创建
   */
  async ensureCollection(): Promise<void> {
    try {
      const response = await this.request('GET', `/collections/${this.collectionName}`);
      if (!response.ok) {
        await this.createCollection();
      }
    } catch {
      await this.createCollection();
    }
  }

  /**
   * 创建 collection
   */
  async createCollection(): Promise<void> {
    await this.request('PUT', `/collections/${this.collectionName}`, {
      vectors: {
        size: this.vectorSize,
        distance: 'Cosine',
      },
    });
  }

  /**
   * 上传场景描述向量
   */
  async upsertSceneVectors(
    scenes: SceneDefinition[],
    getEmbedding: (text: string) => Promise<number[]>
  ): Promise<void> {
    const points = [];

    for (const scene of scenes) {
      if (!scene.enabled) continue;

      // 确保场景有 embedding
      if (!scene.descriptionEmbedding) {
        scene.descriptionEmbedding = await getEmbedding(scene.description);
      }

      points.push({
        id: scene.id,
        vector: scene.descriptionEmbedding,
        payload: {
          sceneId: scene.id,
          name: scene.name,
          description: scene.description,
        },
      });
    }

    if (points.length === 0) return;

    await this.request('PUT', `/collections/${this.collectionName}/points`, {
      points,
    });
  }

  /**
   * 搜索最相似的场景
   */
  async search(
    queryEmbedding: number[],
    limit: number = 5,
    scoreThreshold: number = 0.6
  ): Promise<QdrantSearchResult[]> {
    const response = await this.request('POST', `/collections/${this.collectionName}/points/search`, {
      vector: queryEmbedding,
      limit,
      score_threshold: scoreThreshold,
      with_payload: true,
    });

    const data = await response.json() as { result?: QdrantPoint[] };
    return (data.result || []).map((point: any) => ({
      sceneId: point.payload?.sceneId ?? point.id,
      name: point.payload?.name ?? '',
      description: point.payload?.description ?? '',
      score: point.score,
    }));
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private async request(
    method: string,
    path: string,
    body?: unknown
  ): Promise<{ ok: boolean; json: () => Promise<unknown> }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['api-key'] = this.apiKey;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (globalThis as any).fetch(`${this.url}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    return {
      ok: response.ok,
      json: () => response.json(),
    };
  }
}

interface QdrantPoint {
  id: string | number;
  score: number;
  payload?: {
    sceneId?: string;
    name?: string;
    description?: string;
  };
}

export interface QdrantSearchResult {
  sceneId: string;
  name: string;
  description: string;
  score: number;
}

// ─── Hybrid Match Router ────────────────────────────────────────────────────

/**
 * Layer 2 向量混合匹配器
 * 结合 Qdrant 向量搜索和本地规则匹配
 */
export class HybridMatchRouter {
  private qdrantClient?: QdrantClient;
  private qdrantConfig?: QdrantConfig;
  private similarityThreshold: number = 0.6;
  private scenes: SceneDefinition[] = [];
  private embedText: (text: string) => Promise<number[]>;

  constructor(
    scenes: SceneDefinition[],
    qdrantConfig?: QdrantConfig,
    embedTextFn?: (text: string) => Promise<number[]>
  ) {
    this.scenes = scenes;
    this.qdrantConfig = qdrantConfig;
    this.embedText = embedTextFn ?? generateTextEmbedding;

    if (qdrantConfig) {
      this.qdrantClient = new QdrantClient(qdrantConfig);
    }
  }

  /**
   * 初始化 Qdrant collection 并上传场景向量
   */
  async initialize(): Promise<void> {
    if (!this.qdrantClient) {
      throw new Error('Qdrant not configured');
    }

    await this.qdrantClient.ensureCollection();
    await this.qdrantClient.upsertSceneVectors(this.scenes, this.embedText);
  }

  /**
   * 执行 Layer 2 向量匹配
   */
  async route(
    request: RoutingRequest,
    previousScores: LayerScore[] = []
  ): Promise<{
    response: RoutingResponse | null;
    score: LayerScore;
  }> {
    const { query, queryEmbedding: providedEmbedding } = request;

    // 生成或使用提供的 query embedding
    const queryEmbedding =
      providedEmbedding ?? (await this.embedText(query));

    let bestMatch: QdrantSearchResult | null = null;

    // 如果配置了 Qdrant，使用 Qdrant 搜索
    if (this.qdrantClient) {
      try {
        const results = await this.qdrantClient.search(queryEmbedding, 5, this.similarityThreshold);
        if (results.length > 0) {
          bestMatch = results[0];
        }
      } catch (err) {
        console.error('[HybridMatch] Qdrant search failed:', err);
      }
    } else {
      // 降级：使用本地余弦相似度计算
      bestMatch = this.localVectorSearch(queryEmbedding);
    }

    const score: LayerScore = {
      layer: 2,
      layerName: 'vectorHybridMatch',
      score: bestMatch?.score ?? 0,
      matched: !!bestMatch && bestMatch.score >= this.similarityThreshold,
      details: bestMatch
        ? `Matched: ${bestMatch.name}, similarity: ${bestMatch.score.toFixed(3)}`
        : 'No vector match found',
    };

    if (!bestMatch || bestMatch.score < this.similarityThreshold) {
      return { response: null, score };
    }

    const matchedScene = this.scenes.find((s) => s.id === bestMatch!.sceneId);
    if (!matchedScene) {
      return { response: null, score };
    }

    return {
      response: {
        sceneId: matchedScene.id,
        sceneName: matchedScene.name,
        confidence: bestMatch.score,
        layer: 2,
        reasoning: `Vector similarity match: "${bestMatch.name}" with score ${bestMatch.score.toFixed(3)}`,
        fallback: false,
        metadata: matchedScene.metadata,
        layerScores: [...previousScores, score],
        decisionId: generateDecisionId(),
      },
      score,
    };
  }

  /**
   * 本地向量搜索（无 Qdrant 时的降级方案）
   */
  private localVectorSearch(queryEmbedding: number[]): QdrantSearchResult | null {
    const candidates: QdrantSearchResult[] = [];

    for (const scene of this.scenes) {
      if (!scene.enabled || !scene.descriptionEmbedding) continue;

      try {
        const similarity = cosineSimilarity(queryEmbedding, scene.descriptionEmbedding);
        if (similarity >= this.similarityThreshold) {
          candidates.push({
            sceneId: scene.id,
            name: scene.name,
            description: scene.description,
            score: similarity,
          });
        }
      } catch {
        // 跳过维度不匹配的 scene
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] ?? null;
  }
}

// ─── 辅助函数 ───────────────────────────────────────────────────────────────

function generateDecisionId(): string {
  return `rd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
