import type { AgentEvent, AgentKernel, AgentTask, RunOptions } from "core-agent";
import type { OneAgentRuntime } from "../bootstrap/create-runtime.js";
import { enrichTaskWithProfile } from "../profile/task-enricher.js";
import type { Logger } from "../logging/logger.js";
import type { OneAgentRunOptions } from "../types/execution.js";
import { runKernel, streamKernel } from "./kernel-executor.js";
import { runStandalone } from "./standalone-executor.js";
import { resolveExecutionTier } from "./tier-resolver.js";

export type OneAgentExecutorOptions = {
  runtime: OneAgentRuntime;
  logger: Logger;
};

export class OneAgentExecutor {
  constructor(private readonly deps: OneAgentExecutorOptions) {}

  private prepare(task: AgentTask, agentId: string) {
    const allCapabilityIds = this.deps.runtime.capabilityRegistry.listManifests().map((item) => item.id);
    return enrichTaskWithProfile(task, this.deps.runtime.profileRegistry, {
      defaultAgentId: agentId,
      allCapabilityIds,
    });
  }

  private resolveAgentId(task: AgentTask, options?: { agentId?: string }): string {
    return (
      options?.agentId ??
      (typeof task.metadata?.agentId === "string" ? task.metadata.agentId : this.deps.runtime.config.defaults.agent)
    );
  }

  async run(
    task: AgentTask,
    options?: RunOptions & OneAgentRunOptions & { agentId?: string },
  ): Promise<Awaited<ReturnType<AgentKernel["run"]>> & { executionTier: "standalone" | "kernel" }> {
    const agentId = this.resolveAgentId(task, options);
    const enriched = this.prepare(task, agentId);
    const profile = this.deps.runtime.profileRegistry.get(agentId);
    const tier = resolveExecutionTier({
      task: enriched.task,
      profile,
      defaultTier: this.deps.runtime.config.defaults.executionTier,
      options,
    });

    this.deps.logger.info("oneagent execute", {
      agentId,
      taskId: enriched.task.taskId,
      tier,
    });

    if (tier === "standalone") {
      const result = await runStandalone(
        {
          modelResolver: this.deps.runtime.modelResolver,
          contextPipeline: this.deps.runtime.contextPipeline,
          sessionStore: this.deps.runtime.sessionStore,
          hostBridge: this.deps.runtime.hostBridge,
          logger: this.deps.logger,
        },
        enriched.task,
        options,
      );
      return { ...result, executionTier: "standalone" };
    }

    const result = await runKernel(
      {
        kernel: this.deps.runtime.kernel,
        sidecarUrl: this.deps.runtime.sidecarUrl,
      },
      enriched.task,
      options,
    );
    return { ...result, executionTier: "kernel" };
  }

  stream(
    task: AgentTask,
    options?: RunOptions & OneAgentRunOptions & { agentId?: string },
  ): AsyncGenerator<AgentEvent> {
    const agentId = this.resolveAgentId(task, options);
    const enriched = this.prepare(task, agentId);
    const profile = this.deps.runtime.profileRegistry.get(agentId);
    const tier = resolveExecutionTier({
      task: enriched.task,
      profile,
      defaultTier: this.deps.runtime.config.defaults.executionTier,
      options,
    });

    if (tier === "standalone") {
      throw new Error("Standalone tier does not support stream. Use tier=kernel.");
    }

    return streamKernel(
      {
        kernel: this.deps.runtime.kernel,
        sidecarUrl: this.deps.runtime.sidecarUrl,
      },
      enriched.task,
      options,
    );
  }
}

export function createOneAgentExecutor(runtime: OneAgentRuntime, logger: Logger): OneAgentExecutor {
  return new OneAgentExecutor({ runtime, logger });
}
