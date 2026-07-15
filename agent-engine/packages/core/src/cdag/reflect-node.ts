/**
 * Reflect 节点实现
 * 质量评分节点：质量分 < 阈值时跳转返工，质量分 ≥ 阈值继续
 */

import type {
  ReflectNodeConfig,
  NodeExecutionResult,
  NodeExecutionContext,
  NodeStatus,
} from './types/cdag';
import { NodeType } from './types/cdag';

export interface QualityScore {
  /** 综合质量分 0-1（内部计算标准） */
  overall: number;
  /** 各维度评分 0-1（内部计算标准） */
  dimensions: {
    relevance?: number;
    accuracy?: number;
    completeness?: number;
    coherence?: number;
    helpfulness?: number;
  };
  /** 扣分项列表 */
  deductions: Array<{
    reason: string;
    penalty: number;
  }>;
  /** 加分项列表 */
  bonuses: Array<{
    reason: string;
    bonus: number;
  }>;
  /** 评审意见 */
  comments: string[];
}

export interface ReflectOptions {
  /** 默认质量阈值 */
  defaultThreshold?: number;
  /** LLM 评审提示词模板 */
  judgePromptTemplate?: string;
}

// ─── 分数格式统一工具 ──────────────────────────────────────────────────────────

/**
 * 将任意分数转换为 0-100 整数对外输出
 * 内部统一用 0-1，对外接口统一用 0-100
 */
const toScore100 = (v: number): number => {
  if (isNaN(v)) return 50;
  // 0-1 范围 → 0-100
  if (v <= 1) return Math.round(v * 100);
  // 已是 0-100 → 归一化整数
  return Math.max(0, Math.min(100, Math.round(v)));
};

const DEFAULT_OPTIONS: Required<ReflectOptions> = {
  defaultThreshold: 0.7,
  judgePromptTemplate: `请对以下内容进行质量评审（0-1分）：

内容：
{content}

评审维度：
- 相关性 (relevance): 内容是否切题
- 准确性 (accuracy): 内容是否准确无误
- 完整性 (completeness): 内容是否完整全面
- 连贯性 (coherence): 内容是否逻辑连贯

请以 JSON 格式输出：
{
  "overall": 0.0-1.0,
  "dimensions": {
    "relevance": 0.0-1.0,
    "accuracy": 0.0-1.0,
    "completeness": 0.0-1.0,
    "coherence": 0.0-1.0
  },
  "deductions": [{"reason": "...", "penalty": 0.0-0.1}],
  "bonuses": [{"reason": "...", "bonus": 0.0-0.1}],
  "comments": ["评审意见..."]
}`,
};

/**
 * ReflectNode 执行器
 * 评估前序节点输出质量，决定走向
 */
export class ReflectNodeExecutor {
  private options: Required<ReflectOptions>;

  constructor(options: ReflectOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * 执行 Reflect 节点
   * @param config Reflect 节点配置
   * @param sourceResult 前序节点执行结果（待评审内容）
   * @param context 执行上下文
   * @returns 评审结果（包含质量分和走向决策）
   */
  async execute(
    config: ReflectNodeConfig,
    sourceResult: NodeExecutionResult,
    context: NodeExecutionContext
  ): Promise<ReflectNodeResult> {
    const startTime = Date.now();
    const threshold = config.qualityThreshold ?? this.options.defaultThreshold;

    context.logger.info(
      `[ReflectNode] 开始评审节点 ${config.sourceNodeId} 输出，质量阈值: ${threshold}`
    );

    // 提取待评审内容
    const contentToJudge = this.extractContent(sourceResult.output);
    if (contentToJudge === null || contentToJudge === undefined) {
      return this.createFailResult(
        config,
        startTime,
        '前序节点无有效输出可评审',
        threshold,
        context
      );
    }

    // 执行质量评分
    const score = await this.judgeQuality(contentToJudge, config, context);

    context.logger.info(
      `[ReflectNode] 质量评分: ${score.overall.toFixed(3)} (阈值: ${threshold})，` +
      `维度: relevance=${score.dimensions.relevance?.toFixed(2) ?? 'N/A'}, ` +
      `accuracy=${score.dimensions.accuracy?.toFixed(2) ?? 'N/A'}, ` +
      `completeness=${score.dimensions.completeness?.toFixed(2) ?? 'N/A'}`
    );

    if (score.comments.length > 0) {
      context.logger.info(`[ReflectNode] 评审意见: ${score.comments.join('; ')}`);
    }

    // 判定走向
    const passed = score.overall >= threshold;
    const targetNodeId = passed ? config.passNodeId : config.failNodeId;
    const verdict = passed ? 'PASS' : 'FAIL';

    context.logger.info(
      `[ReflectNode] 判定结果: ${verdict}，跳转到节点 ${targetNodeId}`
    );

    return {
      nodeId: config.id,
      nodeType: NodeType.REFLECT,
      status: NodeStatus.COMPLETED,
      startTime,
      endTime: Date.now(),
      duration: Date.now() - startTime,
      qualityScore: toScore100(score.overall),  // 统一 0-100 对外暴露
      targetNodeId,
      passed,
      score,
      verdict,
    };
  }

  /**
   * 从节点输出中提取待评审内容
   */
  private extractContent(output: any): string | null {
    if (typeof output === 'string') {
      return output;
    }
    if (typeof output === 'object' && output !== null) {
      // 尝试提取常见的 content 字段
      const contentFields = ['content', 'text', 'answer', 'result', 'output', 'response'];
      for (const field of contentFields) {
        if (output[field] !== undefined) {
          const val = output[field];
          return typeof val === 'string' ? val : JSON.stringify(val);
        }
      }
      // 没有常见字段，序列化整个对象
      return JSON.stringify(output);
    }
    return String(output ?? '');
  }

  /**
   * 使用 LLM 进行质量评审
   */
  private async judgeQuality(
    content: string,
    config: ReflectNodeConfig,
    context: NodeExecutionContext
  ): Promise<QualityScore> {
    // 如果配置了自定义评分维度权重，使用配置
    const dimWeights = config.scoringDimensions;

    // 构建评审提示词
    let prompt = this.options.judgePromptTemplate.replace('{content}', content);

    // 如果有维度权重，在 prompt 中说明
    if (dimWeights) {
      const weightHint = Object.entries(dimWeights)
        .map(([k, v]) => `  - ${k}: 权重 ${v}`)
        .join('\n');
      prompt += `\n\n评分权重（供参考）：\n${weightHint}`;
    }

    // 调用 LLM 评审
    // 注意：这里使用 context 中的 llmProviderFactory 来获取 LLM Provider
    if (context.llmProviderFactory) {
      try {
        const llm = context.llmProviderFactory.create({
          provider: 'openai',
          model: 'gpt-4o-mini',
        });

        const response = await llm.chat([
          { role: 'system', content: '你是一个严格的质量评审专家。' },
          { role: 'user', content: prompt },
        ]);

        const text = typeof response === 'string' ? response : JSON.stringify(response);

        // 尝试解析 JSON 评分结果
        const score = this.parseJudgeResponse(text, dimWeights);
        return score;
      } catch (err) {
        context.logger.warn(
          `[ReflectNode] LLM 评审调用失败，使用启发式评分: ${err instanceof Error ? err.message : err}`
        );
        return this.fallbackScore(content, dimWeights);
      }
    } else {
      // 无 LLM，使用启发式评分
      context.logger.warn(`[ReflectNode] 未配置 LLM Provider，使用启发式评分`);
      return this.fallbackScore(content, dimWeights);
    }
  }

  /**
   * 解析 LLM 返回的评审结果
   */
  private parseJudgeResponse(
    text: string,
    dimWeights?: ReflectNodeConfig['scoringDimensions']
  ): QualityScore {
    try {
      // 尝试提取 JSON
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return this.normalizeScore(parsed, dimWeights);
      }
    } catch {
      // 解析失败，使用 fallback
    }

    return this.fallbackScore(text, dimWeights);
  }

  /**
   * 归一化评分结果
   */
  private normalizeScore(
    raw: any,
    dimWeights?: ReflectNodeConfig['scoringDimensions']
  ): QualityScore {
    const dims = raw.dimensions ?? {};

    return {
      overall: Math.max(0, Math.min(1, Number(raw.overall) || 0)),
      dimensions: {
        relevance: Math.max(0, Math.min(1, Number(dims.relevance) || 0.5)),
        accuracy: Math.max(0, Math.min(1, Number(dims.accuracy) || 0.5)),
        completeness: Math.max(0, Math.min(1, Number(dims.completeness) || 0.5)),
        coherence: Math.max(0, Math.min(1, Number(dims.coherence) || 0.5)),
        helpfulness: Math.max(0, Math.min(1, Number(dims.helpfulness) || 0.5)),
      },
      deductions: Array.isArray(raw.deductions) ? raw.deductions : [],
      bonuses: Array.isArray(raw.bonuses) ? raw.bonuses : [],
      comments: Array.isArray(raw.comments) ? raw.comments : [],
    };
  }

  /**
   * 启发式评分（无 LLM 时的降级方案）
   */
  private fallbackScore(
    content: string,
    dimWeights?: ReflectNodeConfig['scoringDimensions']
  ): QualityScore {
    const len = content.length;
    const deductions: QualityScore['deductions'] = [];
    const bonuses: QualityScore['bonuses'] = [];

    // 长度相关
    if (len < 10) {
      deductions.push({ reason: '内容过短', penalty: 0.4 });
    } else if (len < 50) {
      deductions.push({ reason: '内容偏短', penalty: 0.15 });
    } else if (len > 10000) {
      deductions.push({ reason: '内容过长，可能包含冗余', penalty: 0.1 });
    } else {
      bonuses.push({ reason: '长度适中', bonus: 0.1 });
    }

    // 结构化内容加分
    if (content.includes('\n') && (content.includes('- ') || content.includes('* '))) {
      bonuses.push({ reason: '包含结构化列表', bonus: 0.1 });
    }
    if (content.includes('```') || content.includes('```json')) {
      bonuses.push({ reason: '包含代码块', bonus: 0.05 });
    }

    // JSON 格式检测
    try {
      JSON.parse(content);
      bonuses.push({ reason: '有效的 JSON 格式', bonus: 0.15 });
    } catch {
      // 不是纯 JSON，尝试找 JSON 子串
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          JSON.parse(jsonMatch[0]);
          bonuses.push({ reason: '包含有效 JSON', bonus: 0.1 });
        } catch {
          deductions.push({ reason: '包含无效 JSON 片段', penalty: 0.1 });
        }
      }
    }

    // 关键词覆盖（基于维度权重）
    const weights = dimWeights ?? { relevance: 0.3, accuracy: 0.3, completeness: 0.2 };

    let relevance = 0.5;
    if (weights.relevance && content.length > 20) relevance = 0.7;

    let accuracy = 0.6;
    // 检测明显的错误指示词
    const errorIndicators = ['错误', '不对', '可能有问题', '不确定', 'unknown', 'error', 'bug'];
    if (errorIndicators.some((w) => content.toLowerCase().includes(w))) {
      accuracy -= 0.2;
      deductions.push({ reason: '包含错误指示词', penalty: 0.2 });
    }

    let completeness = len > 100 ? 0.7 : 0.4;
    let coherence = content.includes('\n') ? 0.7 : 0.5;

    const baseScore = 0.5;
    const totalDeductions = deductions.reduce((s, d) => s + d.penalty, 0);
    const totalBonuses = bonuses.reduce((s, b) => s + b.bonus, 0);
    const overall = Math.max(0, Math.min(1, baseScore - totalDeductions + totalBonuses));

    return {
      overall,
      dimensions: {
        relevance,
        accuracy,
        completeness,
        coherence,
      },
      deductions,
      bonuses,
      comments: [],
    };
  }

  private createFailResult(
    config: ReflectNodeConfig,
    startTime: number,
    error: string,
    threshold: number,
    context: NodeExecutionContext
  ): ReflectNodeResult {
    context.logger.error(`[ReflectNode] 评审失败: ${error}`);
    return {
      nodeId: config.id,
      nodeType: NodeType.REFLECT,
      status: NodeStatus.FAILED,
      startTime,
      endTime: Date.now(),
      duration: Date.now() - startTime,
      qualityScore: toScore100(0),  // 统一 0-100 对外暴露
      targetNodeId: config.failNodeId,
      passed: false,
      score: {
        overall: 0,
        dimensions: {},
        deductions: [{ reason: error, penalty: 1 }],
        bonuses: [],
        comments: [`评审异常: ${error}`],
      },
      verdict: 'ERROR',
    };
  }
}

/**
 * Reflect 节点执行结果扩展
 */
export interface ReflectNodeResult extends NodeExecutionResult {
  /** 质量评分 0-100（对外接口统一） */
  qualityScore: number;
  /** 目标节点 ID（判定后跳转目标） */
  targetNodeId: string;
  /** 是否通过质量阈值 */
  passed: boolean;
  /** 详细评分 */
  score: QualityScore;
  /** 判定结论 */
  verdict: 'PASS' | 'FAIL' | 'ERROR';
}
