/**
 * C-DAG Executor 主循环
 * 支持串行、并行、条件分支执行
 */

import type {
  ExecutionGraph,
  GraphNodeConfig,
  Edge,
  NodeExecutionResult,
  GraphExecutionResult,
  NodeExecutionContext,
  ExecutionLogger,
  LoopGuard,
} from './types/cdag';
import {
  NodeType,
  NodeStatus,
  type LLMNodeConfig,
  type ToolNodeConfig,
  type ConditionalNodeConfig,
  type ParallelNodeConfig,
  type RetryNodeConfig,
  type ReflectNodeConfig,
  type StartNodeConfig,
  type EndNodeConfig,
} from './types/cdag';
import { LoopGuard as LoopGuardImpl } from './loop-guard';
import { RetryNodeExecutor } from './retry-node';
import { ReflectNodeExecutor, type ReflectNodeResult } from './reflect-node';
import { ConditionEvaluator } from './condition-evaluator';
import { ParallelNodeExecutor } from './parallel-node';
import { LLMJudge, type ScoreResult } from './quality-scorer';

export interface CdagExecutorConfig {
  /** 全局最大步数 */
  globalMaxSteps?: number;
  /** 单节点最大执行次数 */
  nodeMaxExecutions?: number;
  /** 最大执行时间（毫秒） */
  maxExecutionTimeMs?: number;
  /** 默认节点超时（毫秒） */
  defaultNodeTimeoutMs?: number;
  /** LLM Provider 工厂 */
  llmProviderFactory?: any;
  /** 工具执行器 */
  toolExecutor?: any;
  /** 是否输出详细日志 */
  verbose?: boolean;
  /** 质量评分器（用于质量自动重试，P1-T32） */
  qualityJudge?: LLMJudge;
}

interface NodeOutputMap {
  [nodeId: string]: any;
}

const DEFAULT_CONFIG: Required<CdagExecutorConfig> = {
  globalMaxSteps: 50,
  nodeMaxExecutions: 3,
  maxExecutionTimeMs: 5 * 60 * 1000,
  defaultNodeTimeoutMs: 5 * 60 * 1000,
  llmProviderFactory: undefined,
  toolExecutor: undefined,
  verbose: true,
  qualityJudge: undefined,
};

/**
 * C-DAG 执行引擎
 * 负责图的执行调度，包括串行、并行、条件分支
 */
export class CdagExecutor {
  private config: Required<CdagExecutorConfig>;
  private graph: ExecutionGraph;
  private nodeMap: Map<string, GraphNodeConfig>;
  private edgeMap: Map<string, Edge[]>; // sourceId -> edges
  private loopGuard: LoopGuard;
  private nodeOutputs: NodeOutputMap;
  private executionId: string;
  private nodeResults: Map<string, NodeExecutionResult>;
  private logger: ExecutionLogger;
  private retryExecutor: RetryNodeExecutor;
  private reflectExecutor: ReflectNodeExecutor;
  private parallelExecutor: ParallelNodeExecutor;
  private qualityJudge: LLMJudge | undefined;
  private conditionEvaluator: ConditionEvaluator;

  constructor(graph: ExecutionGraph, config: CdagExecutorConfig = {}) {
    this.graph = graph;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
    this.edgeMap = this.buildEdgeMap(graph.edges);
    this.loopGuard = new LoopGuard({
      globalMaxSteps: this.config.globalMaxSteps,
      nodeMaxExecutions: this.config.nodeMaxExecutions,
      maxExecutionTimeMs: this.config.maxExecutionTimeMs,
    });
    this.nodeOutputs = {};
    this.executionId = this.generateExecutionId();
    this.nodeResults = new Map();
    this.logger = this.createLogger();
    this.retryExecutor = new RetryNodeExecutor();
    this.reflectExecutor = new ReflectNodeExecutor();
    this.parallelExecutor = new ParallelNodeExecutor();
    this.conditionEvaluator = new ConditionEvaluator();
    this.qualityJudge = this.config.qualityJudge;
    // 若未传入 qualityJudge 但有 llmProviderFactory，则创建默认实例
    if (!this.qualityJudge && this.config.llmProviderFactory) {
      this.qualityJudge = new LLMJudge({ model: 'gpt-4o-mini', threshold: 70 });
    }
  }

  /**
   * 执行图
   */
  async execute(initialInputs: Record<string, any> = {}): Promise<GraphExecutionResult> {
    const startTime = Date.now();
    this.nodeOutputs = {};

    this.logger.info(`[CdagExecutor] 开始执行图 ${this.graph.id} (${this.graph.name ?? 'unnamed'})`);
    this.logger.info(`[CdagExecutor] 配置: 全局步数上限=${this.config.globalMaxSteps}, ` +
      `节点上限=${this.config.nodeMaxExecutions}, 时间上限=${this.config.maxExecutionTimeMs}ms`);

    // 环检测（执行前）
    const cycle = LoopGuardImpl.detectCycle(this.graph.nodes, this.graph.edges);
    if (cycle) {
      this.logger.error(`[CdagExecutor] 检测到环: ${cycle.join(' -> ')}`);
      return this.createGraphResult('failed', startTime, `检测到环: ${cycle.join(' -> ')}`);
    }

    // 重置 LoopGuard
    this.loopGuard.reset();

    // 初始化全局状态
    const globalState = { ...initialInputs };

    try {
      // 从开始节点执行
      await this.executeFromNode(this.graph.startNodeId, globalState);

      // 检查是否正常结束
      const allEndNodes = this.graph.endNodeIds;
      const allCompleted = allEndNodes.every((endId) => {
        const result = this.nodeResults.get(endId);
        return result?.status === NodeStatus.COMPLETED || result?.status === NodeStatus.SKIPPED;
      });

      if (allCompleted) {
        this.logger.info(`[CdagExecutor] 图执行完成（正常结束）`);
        return this.createGraphResult('success', startTime);
      }

      // 检查是否有失败的节点
      const anyFailed = [...this.nodeResults.values()].some((r) => r.status === NodeStatus.FAILED);
      if (anyFailed) {
        return this.createGraphResult('failed', startTime, '有节点执行失败');
      }

      return this.createGraphResult('success', startTime);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[CdagExecutor] 执行异常: ${errorMsg}`);
      return this.createGraphResult('failed', startTime, errorMsg);
    }
  }

  // ============================================================
  // 主执行逻辑
  // ============================================================

  /**
   * 从指定节点开始执行（可处理串行链和条件分支）
   */
  private async executeFromNode(
    startNodeId: string,
    globalState: Record<string, any>
  ): Promise<NodeExecutionResult | null> {
    let currentNodeId: string | null = startNodeId;

    while (currentNodeId !== null) {
      // LoopGuard 检查
      const guardCheck = this.loopGuard.check(currentNodeId);
      if (!guardCheck.allowed) {
        this.logger.error(`[CdagExecutor] LoopGuard 阻止执行: ${guardCheck.reason}`);
        this.nodeResults.set(currentNodeId, {
          nodeId: currentNodeId,
          nodeType: this.nodeMap.get(currentNodeId)?.type ?? NodeType.LLM,
          status: NodeStatus.FAILED,
          error: `LoopGuard 触发: ${guardCheck.reason}`,
          startTime: Date.now(),
          endTime: Date.now(),
          duration: 0,
        });
        throw new Error(`LoopGuard 阻止执行: ${guardCheck.reason}`);
      }

      // 获取节点配置
      const node = this.nodeMap.get(currentNodeId);
      if (!node) {
        this.logger.error(`[CdagExecutor] 未找到节点: ${currentNodeId}`);
        throw new Error(`节点未找到: ${currentNodeId}`);
      }

      // 跳过禁用的节点
      if (node.enabled === false) {
        this.logger.info(`[CdagExecutor] 跳过禁用节点: ${currentNodeId}`);
        this.nodeResults.set(currentNodeId, {
          nodeId: currentNodeId,
          nodeType: node.type,
          status: NodeStatus.SKIPPED,
          startTime: Date.now(),
          endTime: Date.now(),
          duration: 0,
        });
        currentNodeId = this.getNextNodeId(currentNodeId);
        continue;
      }

      // 构建上下文
      const input = this.gatherNodeInput(currentNodeId);
      const context: NodeExecutionContext = {
        node,
        input,
        globalState,
        executionPath: [],
        llmProviderFactory: this.config.llmProviderFactory,
        toolExecutor: this.config.toolExecutor,
        logger: this.logger,
      };

      // 执行节点
      this.loopGuard.recordExecution(currentNodeId);
      const result = await this.executeNode(context);
      this.nodeResults.set(currentNodeId, result);
      this.nodeOutputs[currentNodeId] = result.output;

      this.logger.info(
        `[CdagExecutor] 节点 ${currentNodeId} (${node.type}) ` +
        `状态: ${result.status}，耗时: ${result.duration}ms`
      );

      // 处理节点特定的后续跳转
      if (result.status === NodeStatus.FAILED) {
        throw new Error(`节点 ${currentNodeId} 执行失败: ${result.error}`);
      }

      if (result.status === NodeStatus.SKIPPED || result.status === NodeStatus.COMPLETED) {
        // 对于 Reflect 节点，跳转到其判定目标
        if (node.type === NodeType.REFLECT && (result as any).targetNodeId) {
          currentNodeId = (result as ReflectNodeResult).targetNodeId;
          continue;
        }

        // 对于 End 节点，结束图执行
        if (node.type === NodeType.END) {
          this.logger.info(`[CdagExecutor] 到达结束节点 ${currentNodeId}，图执行终止`);
          currentNodeId = null;
          continue;
        }
      }

      // 默认：沿边执行下一个节点
      currentNodeId = this.getNextNodeId(currentNodeId);
    }

    return null;
  }

  /**
   * 执行单个节点（根据类型分发）
   */
  private async executeNode(context: NodeExecutionContext): Promise<NodeExecutionResult> {
    const { node } = context;

    switch (node.type) {
      case NodeType.START:
        return this.executeStartNode(node as StartNodeConfig, context);
      case NodeType.LLM:
        return this.executeLLMNode(node as LLMNodeConfig, context);
      case NodeType.TOOL:
        return this.executeToolNode(node as ToolNodeConfig, context);
      case NodeType.CONDITIONAL:
        return this.executeConditionalNode(node as ConditionalNodeConfig, context);
      case NodeType.PARALLEL:
        return this.executeParallelNode(node as ParallelNodeConfig, context);
      case NodeType.RETRY:
        return this.executeRetryNode(node as RetryNodeConfig, context);
      case NodeType.REFLECT:
        return this.executeReflectNode(node as ReflectNodeConfig, context);
      case NodeType.SUBGRAPH:
        return this.executeSubgraphNode(node, context);
      case NodeType.END:
        return this.executeEndNode(node, context);
      default:
        return {
          nodeId: node.id,
          nodeType: node.type,
          status: NodeStatus.FAILED,
          error: `未知节点类型: ${(node as any).type}`,
          startTime: Date.now(),
          endTime: Date.now(),
          duration: 0,
        };
    }
  }

  // ============================================================
  // 各类型节点执行
  // ============================================================

  private async executeStartNode(
    node: StartNodeConfig,
    context: NodeExecutionContext
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();
    this.logger.info(`[StartNode] ${node.id} 初始化输入: ${JSON.stringify(node.initialInputs ?? {})}`);

    // 合并初始输入到全局状态
    if (node.initialInputs) {
      Object.assign(context.globalState, node.initialInputs);
    }

    return {
      nodeId: node.id,
      nodeType: NodeType.START,
      status: NodeStatus.COMPLETED,
      output: node.initialInputs ?? {},
      startTime,
      endTime: Date.now(),
      duration: Date.now() - startTime,
    };
  }

  private async executeLLMNode(
    node: LLMNodeConfig,
    context: NodeExecutionContext
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();
    const { input } = context;

    this.logger.info(`[LLMNode] ${node.id} 开始调用 LLM，模型: ${node.llmConfig.model}`);

    if (!this.config.llmProviderFactory) {
      return {
        nodeId: node.id,
        nodeType: NodeType.LLM,
        status: NodeStatus.FAILED,
        error: 'LLM Provider Factory 未配置',
        startTime,
        endTime: Date.now(),
        duration: Date.now() - startTime,
      };
    }

    // ─── P1-T32: 质量自动重试配置 ─────────────────────────────────────────
    // 质量分 < 70 → 重试 1 次
    // 质量分 < 60 → 重试 2 次
    // 最高重试 2 次
    const QUALITY_THRESHOLD_LOW = 70;
    const QUALITY_THRESHOLD_HIGH = 60;
    const MAX_QUALITY_RETRIES = 2;
    // ───────────────────────────────────────────────────────────────────────

    const attemptLLMCall = async (
      attempt: number
    ): Promise<{ output: string; scoreResult: ScoreResult | null }> => {
      const llm = this.config.llmProviderFactory.create({
        provider: node.llmConfig.provider,
        model: node.llmConfig.model,
        temperature: node.llmConfig.temperature,
        maxTokens: node.llmConfig.maxTokens,
      });

      const messages: Array<{ role: string; content: string }> = [];
      if (node.systemPrompt) {
        messages.push({ role: 'system', content: node.systemPrompt });
      }

      let userMessage = node.userMessageTemplate ?? '{input}';
      if (typeof input === 'object') {
        for (const [key, value] of Object.entries(input)) {
          userMessage = userMessage.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
        }
      } else {
        userMessage = userMessage.replace('{input}', String(input ?? ''));
      }
      messages.push({ role: 'user', content: userMessage });

      if (attempt > 1) {
        // 重试时增加一点点随机温度扰动，鼓励多样性
        llm.temperature = Math.min(1.0, (llm.temperature ?? 0.7) + 0.1);
        this.logger.info(`[LLMNode] ${node.id} 重试 attempt=${attempt}，temperature=${llm.temperature}`);
      }

      const response = await this.withTimeout(
        () => llm.chat(messages),
        node.timeout ?? this.config.defaultNodeTimeoutMs
      );

      const output = typeof response === 'string' ? response : JSON.stringify(response);
      return { output, scoreResult: null };
    };

    try {
      let lastOutput = '';
      let lastScoreResult: ScoreResult | null = null;
      let qualityRetries = 0;

      for (let attempt = 1; attempt <= MAX_QUALITY_RETRIES + 1; attempt++) {
        const { output } = await attemptLLMCall(attempt);
        lastOutput = output;

        this.logger.info(`[LLMNode] ${node.id} attempt=${attempt} 调用成功，输出长度: ${output.length}`);

        // 质量评分（只在第一次之后进行；第一次视为 baseline）
        if (this.qualityJudge && attempt > 1) {
          const scoreResult = await this.qualityJudge.score({
            content: output,
            agentId: node.agentId,
            agentType: node.agentType,
            mode: 'normal',
          });
          lastScoreResult = scoreResult;
          this.logger.info(
            `[LLMNode] ${node.id} quality score=${scoreResult.score} ` +
            `(threshold=${QUALITY_THRESHOLD_LOW}) passed=${scoreResult.passed}`
          );

          if (scoreResult.passed) {
            // 质量合格，结束重试循环
            this.logger.info(`[LLMNode] ${node.id} 质量合格，停止重试`);
            break;
          }

          // 质量不合格，判断是否继续重试
          const remaining = MAX_QUALITY_RETRIES - qualityRetries;
          if (remaining <= 0) {
            this.logger.warn(`[LLMNode] ${node.id} 已达最大质量重试次数 (${MAX_QUALITY_RETRIES})，接受当前结果`);
            break;
          }

          qualityRetries++;
          this.logger.info(
            `[LLMNode] ${node.id} 质量不合格 (score=${scoreResult.score})，` +
            `触发第 ${qualityRetries} 次重试 (剩余 ${remaining})`
          );
          continue;
        } else if (this.qualityJudge && attempt === 1) {
          // 第一次调用也评分，判断是否需要进入重试逻辑
          const scoreResult = await this.qualityJudge.score({
            content: output,
            agentId: node.agentId,
            agentType: node.agentType,
            mode: 'normal',
          });
          lastScoreResult = scoreResult;
          this.logger.info(`[LLMNode] ${node.id} initial quality score=${scoreResult.score}`);

          if (!scoreResult.passed) {
            // 不合格，计算允许的重试次数
            const maxRetries = scoreResult.score < QUALITY_THRESHOLD_HIGH
              ? MAX_QUALITY_RETRIES   // < 60: 2 次重试
              : 1;                     // < 70: 1 次重试

            if (maxRetries > 0) {
              this.logger.info(
                `[LLMNode] ${node.id} 初始质量不合格 (score=${scoreResult.score})，` +
                `将重试最多 ${maxRetries} 次`
              );
              // BUG FIX (P1-T32): 首次不合格也消耗一次重试机会，需正确累加计数器
              // score < 60 → maxRetries=2，首次消耗1次，剩余1次（attempt 2）
              // 60 ≤ score < 70 → maxRetries=1，首次消耗1次，剩余0次
              qualityRetries = maxRetries === MAX_QUALITY_RETRIES ? 1 : maxRetries;
              continue;
            }
          }
          // 合格或不允许重试，退出循环
          break;
        } else {
          // 无 qualityJudge，直接使用第一次结果
          break;
        }
      }

      return {
        nodeId: node.id,
        nodeType: NodeType.LLM,
        status: NodeStatus.COMPLETED,
        output: lastOutput,
        qualityScore: lastScoreResult?.score,
        startTime,
        endTime: Date.now(),
        duration: Date.now() - startTime,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[LLMNode] ${node.id} 调用失败: ${errorMsg}`);
      return {
        nodeId: node.id,
        nodeType: NodeType.LLM,
        status: NodeStatus.FAILED,
        error: errorMsg,
        startTime,
        endTime: Date.now(),
        duration: Date.now() - startTime,
      };
    }
  }

  private async executeToolNode(
    node: ToolNodeConfig,
    context: NodeExecutionContext
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();
    const { input } = context;

    this.logger.info(`[ToolNode] ${node.id} 执行工具: ${node.toolId}`);

    if (!this.config.toolExecutor) {
      return {
        nodeId: node.id,
        nodeType: NodeType.TOOL,
        status: NodeStatus.FAILED,
        error: 'Tool Executor 未配置',
        startTime,
        endTime: Date.now(),
        duration: Date.now() - startTime,
      };
    }

    try {
      // 解析参数模板
      let parameters = node.parameters ?? {};
      if (typeof parameters === 'string') {
        parameters = JSON.parse(parameters);
      }

      // 替换变量
      const resolvedParams: Record<string, any> = {};
      for (const [key, value] of Object.entries(parameters)) {
        resolvedParams[key] = this.resolveVariable(String(value), input, context.globalState);
      }

      const result = await this.withTimeout(
        () =>
          this.config.toolExecutor.executeTool(
            { function: { name: node.toolId, arguments: JSON.stringify(resolvedParams) } } as any,
            { id: node.toolId, name: node.toolId, type: 'custom', enabled: true, parameters: [] } as any
          ),
        node.timeout ?? this.config.defaultNodeTimeoutMs
      );

      // 解析结果
      let output: any;
      try {
        output = JSON.parse(result);
      } catch {
        output = result;
      }

      this.logger.info(`[ToolNode] ${node.id} 执行成功`);

      return {
        nodeId: node.id,
        nodeType: NodeType.TOOL,
        status: NodeStatus.COMPLETED,
        output,
        startTime,
        endTime: Date.now(),
        duration: Date.now() - startTime,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[ToolNode] ${node.id} 执行失败: ${errorMsg}`);
      return {
        nodeId: node.id,
        nodeType: NodeType.TOOL,
        status: NodeStatus.FAILED,
        error: errorMsg,
        startTime,
        endTime: Date.now(),
        duration: Date.now() - startTime,
      };
    }
  }

  private async executeConditionalNode(
    node: ConditionalNodeConfig,
    context: NodeExecutionContext
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();
    const { input, globalState } = context;

    this.logger.info(`[ConditionalNode] ${node.id} 评估条件: ${node.conditionExpression}`);

    try {
      // 解析条件表达式
      const conditionResult = this.evaluateCondition(node.conditionExpression, input, globalState);
      const targetNodeId = conditionResult ? node.trueNodeId : node.falseNodeId;
      const branch = conditionResult ? 'true' : 'false';

      this.logger.info(
        `[ConditionalNode] ${node.id} 条件评估结果: ${branch}，` +
        `跳转节点: ${targetNodeId}`
      );

      return {
        nodeId: node.id,
        nodeType: NodeType.CONDITIONAL,
        status: NodeStatus.COMPLETED,
        output: { conditionResult, targetNodeId, branch },
        startTime,
        endTime: Date.now(),
        duration: Date.now() - startTime,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[ConditionalNode] ${node.id} 条件评估失败: ${errorMsg}`);
      return {
        nodeId: node.id,
        nodeType: NodeType.CONDITIONAL,
        status: NodeStatus.FAILED,
        error: errorMsg,
        startTime,
        endTime: Date.now(),
        duration: Date.now() - startTime,
      };
    }
  }

  private async executeParallelNode(
    node: ParallelNodeConfig,
    context: NodeExecutionContext
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();

    this.logger.info(
      `[ParallelNode] ${node.id} 开始并行执行，策略: ${node.strategy}，` +
      `分支: ${node.nodeIds.join(', ')}`
    );

    const childExecutor = async (nodeId: string): Promise<NodeExecutionResult> => {
      const childNode = this.nodeMap.get(nodeId);
      if (!childNode) {
        return {
          nodeId,
          nodeType: NodeType.LLM,
          status: NodeStatus.FAILED,
          error: `子节点不存在: ${nodeId}`,
          startTime: Date.now(),
          endTime: Date.now(),
          duration: 0,
        };
      }

      const childContext: NodeExecutionContext = {
        node: childNode,
        input: context.input,
        globalState: context.globalState,
        executionPath: [],
        llmProviderFactory: this.config.llmProviderFactory,
        toolExecutor: this.config.toolExecutor,
        logger: context.logger,
      };

      return this.executeNode(childContext);
    };

    const result = await this.parallelExecutor.execute(
      node,
      this.nodeMap,
      childExecutor,
      context
    );

    // 存储输出
    this.nodeOutputs[node.id] = result.output;

    // 并行节点完成后，处理后续
    if (node.convergeNodeId) {
      this.logger.info(`[ParallelNode] ${node.id} 完成后跳转到汇聚节点: ${node.convergeNodeId}`);
      // 递归执行汇聚节点
      await this.executeFromNode(node.convergeNodeId, context.globalState);
    }

    return {
      nodeId: node.id,
      nodeType: NodeType.PARALLEL,
      status: result.status,
      output: result.output,
      startTime,
      endTime: Date.now(),
      duration: Date.now() - startTime,
    };
  }

  private async executeRetryNode(
    node: RetryNodeConfig,
    context: NodeExecutionContext
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();

    this.logger.info(
      `[RetryNode] ${node.id} 开始执行子节点 ${node.childNodeId}，` +
      `最大重试: ${node.maxRetries ?? 3}`
    );

    const childExecutor = async (childNodeId: string): Promise<NodeExecutionResult> => {
      const childNode = this.nodeMap.get(childNodeId);
      if (!childNode) {
        return {
          nodeId: childNodeId,
          nodeType: NodeType.LLM,
          status: NodeStatus.FAILED,
          error: `子节点不存在: ${childNodeId}`,
          startTime: Date.now(),
          endTime: Date.now(),
          duration: 0,
        };
      }

      const childContext: NodeExecutionContext = {
        node: childNode,
        input: context.input,
        globalState: context.globalState,
        executionPath: [],
        llmProviderFactory: this.config.llmProviderFactory,
        toolExecutor: this.config.toolExecutor,
        logger: context.logger,
      };

      return this.executeNode(childContext);
    };

    const result = await this.retryExecutor.execute(node, childExecutor, context);
    this.nodeOutputs[node.id] = result.output;

    return result;
  }

  private async executeReflectNode(
    node: ReflectNodeConfig,
    context: NodeExecutionContext
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();

    this.logger.info(
      `[ReflectNode] ${node.id} 开始评审节点 ${node.sourceNodeId}，` +
      `阈值: ${node.qualityThreshold}`
    );

    const sourceResult = this.nodeResults.get(node.sourceNodeId);
    if (!sourceResult) {
      return {
        nodeId: node.id,
        nodeType: NodeType.REFLECT,
        status: NodeStatus.FAILED,
        error: `源节点 ${node.sourceNodeId} 无执行结果`,
        startTime,
        endTime: Date.now(),
        duration: Date.now() - startTime,
      };
    }

    const result = await this.reflectExecutor.execute(node, sourceResult, context);
    this.nodeOutputs[node.id] = result;

    return result;
  }

  private async executeSubgraphNode(
    node: GraphNodeConfig,
    context: NodeExecutionContext
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();

    // 如果是内联子图，执行它
    if ((node as any).subgraph) {
      const subGraph = (node as any).subgraph as ExecutionGraph;
      const subExecutor = new CdagExecutor(subGraph, {
        llmProviderFactory: this.config.llmProviderFactory,
        toolExecutor: this.config.toolExecutor,
        verbose: this.config.verbose,
      });
      const subResult = await subExecutor.execute(context.input);

      return {
        nodeId: node.id,
        nodeType: NodeType.SUBGRAPH,
        status: subResult.status === 'success' ? NodeStatus.COMPLETED : NodeStatus.FAILED,
        output: subResult.output,
        startTime,
        endTime: Date.now(),
        duration: Date.now() - startTime,
      };
    }

    return {
      nodeId: node.id,
      nodeType: NodeType.SUBGRAPH,
      status: NodeStatus.FAILED,
      error: '子图节点未配置 subgraph 或 subgraphId',
      startTime,
      endTime: Date.now(),
      duration: Date.now() - startTime,
    };
  }

  private async executeEndNode(
    node: GraphNodeConfig,
    context: NodeExecutionContext
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();

    this.logger.info(`[EndNode] ${node.id} 图执行终止`);

    return {
      nodeId: node.id,
      nodeType: NodeType.END,
      status: NodeStatus.COMPLETED,
      output: context.globalState,
      startTime,
      endTime: Date.now(),
      duration: Date.now() - startTime,
    };
  }

  // ============================================================
  // 辅助方法
  // ============================================================

  private buildEdgeMap(edges: Edge[]): Map<string, Edge[]> {
    const map = new Map<string, Edge[]>();
    for (const edge of edges) {
      if (!map.has(edge.sourceId)) {
        map.set(edge.sourceId, []);
      }
      map.get(edge.sourceId)!.push(edge);
    }
    return map;
  }

  private getNextNodeId(currentNodeId: string): string | null {
    const outgoingEdges = this.edgeMap.get(currentNodeId) ?? [];
    if (outgoingEdges.length === 0) {
      return null;
    }
    // 默认取第一条边
    return outgoingEdges[0].targetId;
  }

  private gatherNodeInput(nodeId: string): any {
    // 收集所有指向此节点的边的源节点输出
    const incomingEdges = this.graph.edges.filter((e) => e.targetId === nodeId);
    if (incomingEdges.length === 0) {
      return {};
    }
    if (incomingEdges.length === 1) {
      return this.nodeOutputs[incomingEdges[0].sourceId] ?? {};
    }
    // 多个输入源：合并
    const combined: Record<string, any> = {};
    for (const edge of incomingEdges) {
      const sourceOutput = this.nodeOutputs[edge.sourceId];
      if (sourceOutput !== undefined) {
        if (typeof sourceOutput === 'object' && !Array.isArray(sourceOutput)) {
          Object.assign(combined, sourceOutput);
        } else {
          combined[edge.sourceId] = sourceOutput;
        }
      }
    }
    return combined;
  }

  private resolveVariable(
    template: string,
    input: any,
    globalState: Record<string, any>
  ): any {
    // 支持 ${varName} 格式的变量替换
    return template.replace(/\$\{([^}]+)\}/g, (_, varPath) => {
      const parts = varPath.trim().split('.');
      let value: any = input;
      for (const part of parts) {
        value = value?.[part];
      }
      if (value === undefined) {
        value = globalState;
        for (const part of parts) {
          value = value?.[part];
        }
      }
      return value !== undefined ? String(value) : '';
    });
  }

  private evaluateCondition(
    expression: string,
    input: any,
    globalState: Record<string, any>
  ): boolean {
    // 委托给 ConditionEvaluator，支持 && / || / ! 等复杂逻辑
    return this.conditionEvaluator.evaluate(expression, { input, globalState });
  }

  private resolveValue(raw: string, input: any, globalState: Record<string, any>): any {
    // 尝试解析为数字
    const num = Number(raw);
    if (!isNaN(num)) return num;

    // 尝试解析为布尔
    if (raw === 'true') return true;
    if (raw === 'false') return false;

    // 尝试解析为字符串（引号包裹）
    if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
      return raw.slice(1, -1);
    }

    // 查找变量
    const parts = raw.trim().split('.');
    let value: any = input;
    for (const part of parts) {
      value = value?.[part];
    }
    if (value !== undefined) return value;

    value = globalState;
    for (const part of parts) {
      value = value?.[part];
    }
    return value ?? raw;
  }

  private evaluateExpression(
    expr: string,
    input: any,
    globalState: Record<string, any>
  ): any {
    // 简单表达式求值（只支持变量引用）
    const varName = expr.trim();
    const value = this.resolveValue(varName, input, globalState);
    return value;
  }

  private withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`执行超时 (${timeoutMs}ms)`));
      }, timeoutMs);
      fn()
        .then((v) => { clearTimeout(timer); resolve(v); })
        .catch((e) => { clearTimeout(timer); reject(e); });
    });
  }

  private createGraphResult(
    status: GraphExecutionResult['status'],
    startTime: number,
    terminationReason?: string
  ): GraphExecutionResult {
    const endTime = Date.now();

    // 收集最终输出（通常是最后一个 End 节点之前的输出）
    let finalOutput: any;
    for (const [nodeId, result] of this.nodeResults) {
      const node = this.nodeMap.get(nodeId);
      if (node?.type === NodeType.END) {
        finalOutput = result.output;
      }
    }

    return {
      executionId: this.executionId,
      graphId: this.graph.id,
      status,
      nodeResults: this.nodeResults,
      output: finalOutput,
      startTime,
      endTime,
      totalDuration: endTime - startTime,
      terminationReason,
    };
  }

  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  private createLogger(): ExecutionLogger {
    const verbose = this.config.verbose;
    return {
      info: (msg, data) => {
        if (verbose) console.log(`[INFO] ${msg}`, data ?? '');
      },
      warn: (msg, data) => {
        if (verbose) console.warn(`[WARN] ${msg}`, data ?? '');
      },
      error: (msg, data) => {
        console.error(`[ERROR] ${msg}`, data ?? '');
      },
      debug: (msg, data) => {
        if (verbose) console.debug(`[DEBUG] ${msg}`, data ?? '');
      },
    };
  }
}
