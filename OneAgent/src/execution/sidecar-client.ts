import type { AgentEvent, AgentKernel, AgentTask, RunOptions } from "core-agent";
import { parseSseStream } from "../utils/sse-parser.js";

function sidecarHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = process.env.CORE_AGENT_GATEWAY_TOKEN ?? process.env.ONEAGENT_SIDECAR_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function sidecarBaseUrl(sidecarUrl: string): string {
  return sidecarUrl.replace(/\/$/, "");
}

export async function runViaSidecar(
  sidecarUrl: string,
  task: AgentTask,
  options?: RunOptions,
): Promise<Awaited<ReturnType<AgentKernel["run"]>>> {
  const response = await fetch(`${sidecarBaseUrl(sidecarUrl)}/v1/tasks/run`, {
    method: "POST",
    headers: sidecarHeaders(),
    body: JSON.stringify({ task, options }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SpAgent sidecar failed: ${response.status} ${body}`);
  }

  const payload = (await response.json()) as { result?: Awaited<ReturnType<AgentKernel["run"]>>; ok?: boolean };
  if (!payload.result) {
    throw new Error("SpAgent sidecar response missing result");
  }
  return payload.result;
}

export async function* streamViaSidecar(
  sidecarUrl: string,
  task: AgentTask,
  options?: RunOptions,
): AsyncGenerator<AgentEvent> {
  const response = await fetch(`${sidecarBaseUrl(sidecarUrl)}/v1/tasks/stream`, {
    method: "POST",
    headers: sidecarHeaders(),
    body: JSON.stringify({
      task,
      options: {
        ...options,
        mode: "stream",
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SpAgent sidecar stream failed: ${response.status} ${body}`);
  }
  if (!response.body) {
    throw new Error("SpAgent sidecar stream response missing body");
  }

  for await (const message of parseSseStream(response.body)) {
    if (message.event === "done") {
      return;
    }
    if (message.event === "error") {
      throw new Error(message.data);
    }
    try {
      const event = JSON.parse(message.data) as AgentEvent;
      if (typeof event === "object" && event !== null && "type" in event) {
        yield event;
      }
    } catch {
      // 跳过无法解析的 SSE 块
    }
  }
}
