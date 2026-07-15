import type {
  AgentTask,
  AgentTurnResult,
  ContextPipeline,
  HostBridge,
  ModelResolver,
  RunOptions,
  SessionStore,
} from "core-agent";
import { DefaultPolicyEngine } from "core-agent";
import type { Logger } from "../logging/logger.js";

export type StandaloneExecutorDeps = {
  modelResolver: ModelResolver;
  contextPipeline: ContextPipeline;
  sessionStore: SessionStore;
  hostBridge: HostBridge;
  logger: Logger;
};

export async function runStandalone(
  deps: StandaloneExecutorDeps,
  task: AgentTask,
  options?: RunOptions,
): Promise<AgentTurnResult> {
  const startedAt = new Date().toISOString();
  const policyEngine = new DefaultPolicyEngine();
  const policyDecision = await policyEngine.evaluateTask(task, { task, actor: task.actor });

  let session = task.sessionId ? await deps.sessionStore.load(task.sessionId) : null;
  if (!session) {
    session = await deps.sessionStore.create({ sessionId: task.sessionId });
  }

  const sessionEvents = await deps.sessionStore.getEvents(session.sessionId);
  const policy = policyDecision.policy ?? {
    allowedCapabilityIds: [],
    maxIterations: 1,
    maxToolCalls: 0,
    approvalRequiredFor: [],
  };
  const context = await deps.contextPipeline.build({
    task,
    session,
    sessionEvents,
    memory: null,
    capabilities: [],
    policy,
    hostBridge: deps.hostBridge,
  });

  const selection = await deps.modelResolver.resolve(task, options);
  const response = await selection.adapter.invoke(context.request, {
    task,
    session,
    traceId: task.traceId,
  });

  const completedAt = new Date().toISOString();
  if (response.type === "final") {
    return {
      taskId: task.taskId,
      sessionId: session.sessionId,
      traceId: task.traceId,
      status: "completed",
      finalText: response.text,
      finalStructured: response.structured,
      usage: {
        iterationCount: 1,
        toolCallCount: 0,
        provider: selection.provider,
        model: selection.model,
        inputTokens: response.usage?.inputTokens,
        outputTokens: response.usage?.outputTokens,
        totalTokens: response.usage?.totalTokens,
      },
      usedCapabilities: [],
      startedAt,
      completedAt,
    };
  }

  return {
    taskId: task.taskId,
    sessionId: session.sessionId,
    traceId: task.traceId,
    status: "failed",
    error: {
      code: "MODEL_RESPONSE_INVALID",
      message: "Standalone mode expects a final text response without tool calls. Use tier=kernel for complex tasks.",
    },
    usage: {
      iterationCount: 1,
      toolCallCount: 0,
      provider: selection.provider,
      model: selection.model,
    },
    usedCapabilities: [],
    startedAt,
    completedAt,
  };
}
