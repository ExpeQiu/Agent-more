/**
 * Quality Scorer — P1-T30
 * 质量评分框架：QualityScorer 接口 + LLMJudge 实现
 *
 * 评分范围：0-100
 * 评分耗时目标：< 5s
 */

import type { ChatMessage } from '../types/llm';
import type { ILLMProvider } from '../types/llm';

// ─── 评分输入/输出类型 ────────────────────────────────────────────────────────

export interface ScoreParams {
  /** 待评分的 Agent 输出内容 */
  content: string;
  /** Agent ID（可选，用于针对性评分） */
  agentId?: string;
  /** Agent 类型（可选，影响评分 prompt） */
  agentType?: string;
  /** 评分模式 */
  mode?: ScoreMode;
  /** 自定义评分维度权重 */
  dimensions?: ScoreDimensions;
  /** LLM Provider（可选，不传则用启发式评分） */
  llmProvider?: ILLMProvider;
  /** 使用的模型（默认 gpt-4o-mini） */
  model?: string;
  /** 评分超时（ms），默认 5000 */
  timeoutMs?: number;
}

export interface ScoreDimensions {
  relevance?: number;    // 相关性权重
  accuracy?: number;     // 准确性权重
  completeness?: number; // 完整性权重
  coherence?: number;    // 连贯性权重
  helpfulness?: number;  // 有用性权重
}

export type ScoreMode = 'strict' | 'normal' | 'lenient';

export interface ScoreResult {
  /** 综合质量分 0-100 */
  score: number;
  /** 是否通过（默认阈值 70） */
  passed: boolean;
  /** 阈值（默认 70） */
  threshold: number;
  /** 各维度评分 0-100 */
  dimensions: {
    relevance?: number;
    accuracy?: number;
    completeness?: number;
    coherence?: number;
    helpfulness?: number;
  };
  /** 扣分项列表 */
  deductions: Array<{ reason: string; penalty: number }>;
  /** 加分项列表 */
  bonuses: Array<{ reason: string; bonus: number }>;
  /** 评审意见 */
  comments: string[];
  /** 评分耗时（ms） */
  durationMs: number;
  /** 评分方式 */
  method: 'llm' | 'heuristic';
}

// ─── QualityScorer 接口 ───────────────────────────────────────────────────────

/**
 * 质量评分器接口
 * 可对接不同评分实现（LLM / 规则 / 混合）
 */
export interface QualityScorer {
  /**
   * 对 Agent 输出进行质量评分
   * @param params 评分参数
   * @returns 评分结果（score: 0-100）
   */
  score(params: ScoreParams): Promise<ScoreResult>;

  /**
   * 检查评分器是否可用（LLM 连接正常等）
   */
  isAvailable?(): Promise<boolean>;
}

// ─── LLMJudge ────────────────────────────────────────────────────────────────

const DEFAULT_SCORER_MODEL = 'gpt-4o-mini';
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_THRESHOLD = 70;

const JUDGE_PROMPT_TEMPLATES: Record<ScoreMode, string> = {
  normal: `你是一个严格的质量评审专家。请对以下 AI Agent 输出进行质量评审。

待评审内容：
{content}

评审维度（每项 0-100 分）：
- relevance（相关性）: 内容是否切题、回应用户问题
- accuracy（准确性）: 内容是否准确无误、无幻觉
- completeness（完整性）: 内容是否完整全面、无遗漏
- coherence（连贯性）: 内容是否逻辑连贯、条理清晰
- helpfulness（有用性）: 内容是否有实际帮助、解决问题

请以纯 JSON 格式输出评审结果（不允许其他文字）：
{
  "overall": 0-100,
  "dimensions": {
    "relevance": 0-100,
    "accuracy": 0-100,
    "completeness": 0-100,
    "coherence": 0-100,
    "helpfulness": 0-100
  },
  "deductions": [{"reason": "扣分原因", "penalty": 0-20}],
  "bonuses": [{"reason": "加分原因", "bonus": 0-10}],
  "comments": ["具体评审意见..."]
}`,

  strict: `你是一个极其严格的 AI 质量评审专家。请以最高标准评审。

待评审内容：
{content}

评分标准：
- relevance（相关性）: 0-100，是否完全切题
- accuracy（准确性）: 0-100，事实正确、无错误
- completeness（完整性）: 0-100，覆盖所有要点
- coherence（连贯性）: 0-100，逻辑严密、表达清晰
- helpfulness（有用性）: 0-100，真正解决用户问题

严格扣分：
- 轻微不准确: -5
- 明显错误: -15
- 内容空洞: -10
- 逻辑混乱: -10
- 重复冗余: -5

请输出纯 JSON：
{
  "overall": 0-100,
  "dimensions": {...},
  "deductions": [...],
  "bonuses": [...],
  "comments": [...]
}`,

  lenient: `你是一个宽容但有标准的 AI 质量评审专家。

待评审内容：
{content}

鼓励加分项：
- 有独到见解: +10
- 超出预期地全面: +10
- 结构化清晰美观: +5
- 包含实用示例: +5

请输出纯 JSON：
{
  "overall": 0-100,
  "dimensions": {...},
  "deductions": [...],
  "bonuses": [...],
  "comments": [...]
}`,
};

/**
 * LLM 驱动的质量评分器
 * 调用 LLM 对 Agent 输出进行质量评审，返回 0-100 分
 */
export class LLMJudge implements QualityScorer {
  private defaultModel: string;
  private defaultTimeoutMs: number;
  private defaultThreshold: number;

  constructor(opts: { model?: string; timeoutMs?: number; threshold?: number } = {}) {
    this.defaultModel = opts.model ?? DEFAULT_SCORER_MODEL;
    this.defaultTimeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.defaultThreshold = opts.threshold ?? DEFAULT_THRESHOLD;
  }

  async score(params: ScoreParams): Promise<ScoreResult> {
    const startTime = Date.now();
    const {
      content,
      mode = 'normal',
      dimensions,
      llmProvider,
      model,
      timeoutMs = this.defaultTimeoutMs,
    } = params;

    const scoringModel = model ?? this.defaultModel;

    // 空内容保护
    if (!content || content.trim().length === 0) {
      return {
        score: 0,
        passed: false,
        threshold: this.defaultThreshold,
        dimensions: {},
        deductions: [{ reason: '内容为空', penalty: 100 }],
        bonuses: [],
        comments: ['Agent 输出为空，无法评分'],
        durationMs: Date.now() - startTime,
        method: 'heuristic',
      };
    }

    // 如果有 LLM Provider，使用 LLM 评分
    if (llmProvider) {
      try {
        const result = await this.scoreWithLLM({
          content,
          mode,
          dimensions,
          llmProvider,
          model: scoringModel,
          timeoutMs,
          startTime,
        });
        return result;
      } catch (err) {
        // 降级到启发式评分
        return this.heuristicScore(content, dimensions, startTime);
      }
    }

    // 无 LLM Provider，使用启发式评分
    return this.heuristicScore(content, dimensions, startTime);
  }

  async isAvailable(): Promise<boolean> {
    return true; // 由调用方确保 provider 有效
  }

  // ─── LLM 评分 ──────────────────────────────────────────────────────────────

  private async scoreWithLLM(params: {
    content: string;
    mode: ScoreMode;
    dimensions?: ScoreDimensions;
    llmProvider: ILLMProvider;
    model: string;
    timeoutMs: number;
    startTime: number;
  }): Promise<ScoreResult> {
    const { content, mode, dimensions, llmProvider, model, timeoutMs, startTime } = params;

    const template = JUDGE_PROMPT_TEMPLATES[mode].replace('{content}', content);

    const messages: ChatMessage[] = [
      { role: 'system', content: '你是一个严格的质量评审专家。' },
      { role: 'user', content: template },
    ];

    // 5s 超时兜底（依赖 LLM Adapter 自带超时）
    const deadline = Date.now() + timeoutMs;
    const waitForTimeout = (): Promise<never> =>
      new Promise((_, reject) => {
        const schedule = () => {
          if (Date.now() >= deadline) {
            reject(new Error(`LLM 评分超时 (${timeoutMs}ms)`));
          } else {
            setTimeout(schedule, Math.min(100, deadline - Date.now()));
          }
        };
        setTimeout(schedule, Math.min(100, deadline - Date.now()));
      });
    const llmResponse = await Promise.race([llmProvider.chat(messages, {
      provider: 'openai',
      apiKey: '',
      model,
      temperature: 0.1,
      maxTokens: 2048,
    } as any), waitForTimeout()]);

    const rawText = llmResponse.content;

    // 解析 JSON
    const parsed = this.parseJudgeResponse(rawText);
    return this.normalizeScoreResult(parsed, dimensions, startTime, 'llm');
  }

  private parseJudgeResponse(text: string): any {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // fall through
    }
    return null;
  }

  private normalizeScoreResult(
    raw: any,
    dimWeights: ScoreDimensions | undefined,
    startTime: number,
    method: 'llm' | 'heuristic'
  ): ScoreResult {
    const dims = raw?.dimensions ?? {};

    // 统一到 0-100
    // 对外接口：统一输出 0-100 整数
    const toScore100 = (v: any): number => {
      const n = Number(v);
      if (isNaN(n)) return 50;
      // 内部计算用 0-1，外部接口用 0-100
      // 若输入 ≤ 1，视为 0-1 范围，转换到 0-100
      if (n <= 1) return Math.round(n * 100);
      // 否则视为 0-100，直接归一化到整数
      return Math.max(0, Math.min(100, Math.round(n)));
    };

    // 归一化：将任意数值归一化到 [0,1] 区间（内部计算用）
    const normalize = (v: any): number => {
      const n = Number(v);
      if (isNaN(n)) return 0.5;
      if (n <= 1) return Math.max(0, Math.min(1, n));
      return Math.max(0, Math.min(1, n / 100));
    };

    const overall = toScore100(raw?.overall);
    const dimensions = {
      relevance: toScore100(dims.relevance),
      accuracy: toScore100(dims.accuracy),
      completeness: toScore100(dims.completeness),
      coherence: toScore100(dims.coherence),
      helpfulness: toScore100(dims.helpfulness),
    };

    // 归一化扣分/加分项
    const normalizeDeductions = (items: any[]): Array<{ reason: string; penalty: number }> => {
      if (!Array.isArray(items)) return [];
      return items.map((d) => ({
        reason: String(d.reason ?? ''),
        penalty: Math.max(0, Math.min(100, toScore100(d.penalty))),
      }));
    };

    const normalizeBonuses = (items: any[]): Array<{ reason: string; bonus: number }> => {
      if (!Array.isArray(items)) return [];
      return items.map((b) => ({
        reason: String(b.reason ?? ''),
        bonus: Math.max(0, Math.min(100, toScore100(b.bonus))),
      }));
    };

    const comments = Array.isArray(raw?.comments) ? raw.comments : [];

    return {
      score: overall,
      passed: overall >= this.defaultThreshold,
      threshold: this.defaultThreshold,
      dimensions,
      deductions: normalizeDeductions(raw?.deductions),
      bonuses: normalizeBonuses(raw?.bonuses),
      comments,
      durationMs: Date.now() - startTime,
      method,
    };
  }

  // ─── 启发式评分（降级方案） ─────────────────────────────────────────────────

  private heuristicScore(
    content: string,
    dimWeights: ScoreDimensions | undefined,
    startTime: number
  ): ScoreResult {
    const len = content.length;
    const deductions: Array<{ reason: string; penalty: number }> = [];
    const bonuses: Array<{ reason: string; bonus: number }> = [];

    let score = 70; // 基础分

    // 长度分析
    if (len < 10) {
      deductions.push({ reason: '内容过短', penalty: 60 });
    } else if (len < 50) {
      deductions.push({ reason: '内容偏短', penalty: 20 });
    } else if (len < 200) {
      deductions.push({ reason: '内容略短', penalty: 10 });
    } else if (len > 50000) {
      deductions.push({ reason: '内容过长，可能冗余', penalty: 15 });
    } else {
      bonuses.push({ reason: '长度适中', bonus: 5 });
    }

    // 结构化内容
    const hasList = /\n\s*[-*]\s/.test(content) || /\n\s*\d+\.\s/.test(content);
    const hasCode = /```[\s\S]*?```/.test(content) || /`[^`]+`/.test(content);
    const hasHeaders = /^#{1,3}\s+.+$/m.test(content);
    const hasNewlines = content.split('\n').length > 3;

    if (hasList) bonuses.push({ reason: '包含列表结构', bonus: 8 });
    if (hasCode) bonuses.push({ reason: '包含代码', bonus: 8 });
    if (hasHeaders) bonuses.push({ reason: '包含标题结构', bonus: 5 });
    if (!hasNewlines && len > 500) deductions.push({ reason: '无分段，长文本堆积', penalty: 10 });

    // JSON 检测
    try {
      JSON.parse(content);
      bonuses.push({ reason: '有效的 JSON 格式', bonus: 15 });
    } catch {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          JSON.parse(jsonMatch[0]);
          bonuses.push({ reason: '包含有效 JSON', bonus: 10 });
        } catch {
          deductions.push({ reason: '包含无效 JSON 片段', penalty: 10 });
        }
      }
    }

    // 错误指示词检测
    const errorWords = ['错误', '不对', '不知道', '不确定', 'unknown', 'error', 'bug', 'undefined', 'null'];
    const hasErrors = errorWords.some((w) => content.toLowerCase().includes(w));
    if (hasErrors) {
      deductions.push({ reason: '包含错误/不确定指示词', penalty: 20 });
    }

    // 重复检测
    const words = content.split(/\s+/);
    const uniqueWords = new Set(words.map((w) => w.toLowerCase()));
    if (words.length > 20 && uniqueWords.size / words.length < 0.3) {
      deductions.push({ reason: '内容重复率高', penalty: 25 });
    }

    // 计算总分
    const totalDeductions = deductions.reduce((s, d) => s + d.penalty, 0);
    const totalBonuses = bonuses.reduce((s, b) => s + b.bonus, 0);
    const finalScore = Math.max(0, Math.min(100, Math.round(score - totalDeductions + totalBonuses)));

    return {
      score: finalScore,
      passed: finalScore >= this.defaultThreshold,
      threshold: this.defaultThreshold,
      dimensions: {
        relevance: hasErrors ? Math.max(30, 70 - totalDeductions) : 70,
        accuracy: hasErrors ? Math.max(30, 65 - totalDeductions) : 65,
        completeness: len > 100 ? 70 : 50,
        coherence: hasNewlines ? 70 : 55,
        helpfulness: 65,
      },
      deductions,
      bonuses,
      comments: [],
      durationMs: Date.now() - startTime,
      method: 'heuristic',
    };
  }
}

// ─── 便捷函数 ────────────────────────────────────────────────────────────────

/**
 * 快速评分（使用默认 LLMJudge）
 */
export async function quickScore(
  content: string,
  llmProvider?: ILLMProvider,
  threshold = DEFAULT_THRESHOLD
): Promise<ScoreResult> {
  const scorer = new LLMJudge({ threshold });
  return scorer.score({ content, llmProvider });
}
