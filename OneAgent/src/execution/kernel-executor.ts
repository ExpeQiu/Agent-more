import type { AgentEvent, AgentKernel, AgentTask, RunOptions } from "core-agent";
import { runViaSidecar, streamViaSidecar } from "./sidecar-client.js";

export type KernelExecutorDeps = {
  kernel: AgentKernel;
  sidecarUrl?: string;
};

export async function runKernel(
  deps: KernelExecutorDeps,
  task: AgentTask,
  options?: RunOptions,
): Promise<Awaited<ReturnType<AgentKernel["run"]>>> {
  if (deps.sidecarUrl) {
    return runViaSidecar(deps.sidecarUrl, task, options);
  }
  return deps.kernel.run(task, options);
}

export async function* streamKernel(
  deps: KernelExecutorDeps,
  task: AgentTask,
  options?: RunOptions,
): AsyncGenerator<AgentEvent> {
  if (deps.sidecarUrl) {
    yield* streamViaSidecar(deps.sidecarUrl, task, options);
    return;
  }
  yield* deps.kernel.stream(task, options);
}
