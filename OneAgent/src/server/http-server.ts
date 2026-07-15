import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AgentEvent, AgentTask, RunOptions } from "core-agent";
import type { OneAgentRuntime } from "../bootstrap/create-runtime.js";
import type { Logger } from "../logging/logger.js";
import type { ExecutionTier, OneAgentRunOptions } from "../types/execution.js";

const SERVER_VERSION = "0.1.0";

export type OneAgentHttpServerOptions = {
  runtime: OneAgentRuntime;
  logger: Logger;
  authToken?: string;
  port?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJsonBody(req: IncomingMessage, maxBytes = 1_048_576): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > maxBytes) {
      throw new Error("Request body too large");
    }
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) {
    return {};
  }
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Request body must be a JSON object");
  }
  return parsed;
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function checkAuth(req: IncomingMessage, authToken?: string): boolean {
  if (!authToken) {
    return true;
  }
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return false;
  }
  return header.slice("Bearer ".length) === authToken;
}

function buildTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeTask(input: unknown, agentId: string): AgentTask {
  if (!isRecord(input)) {
    throw new Error("task must be an object");
  }
  const actor = input.actor;
  if (!isRecord(actor) || typeof actor.userId !== "string") {
    throw new Error("task.actor.userId is required");
  }

  return {
    taskId: typeof input.taskId === "string" ? input.taskId : buildTaskId(),
    sessionId: typeof input.sessionId === "string" ? input.sessionId : undefined,
    traceId: typeof input.traceId === "string" ? input.traceId : undefined,
    actor: {
      userId: actor.userId,
      displayName: typeof actor.displayName === "string" ? actor.displayName : undefined,
      roles: Array.isArray(actor.roles) ? actor.roles.filter((role): role is string => typeof role === "string") : undefined,
    },
    tenant: isRecord(input.tenant) && typeof input.tenant.tenantId === "string"
      ? { tenantId: input.tenant.tenantId }
      : undefined,
    goal: typeof input.goal === "string" ? input.goal : "",
    contextRefs: Array.isArray(input.contextRefs) ? input.contextRefs as AgentTask["contextRefs"] : undefined,
    metadata: {
      ...(isRecord(input.metadata) ? input.metadata : {}),
      agentId,
    },
    constraints: isRecord(input.constraints) ? input.constraints as AgentTask["constraints"] : undefined,
  };
}

function prepareTask(task: AgentTask, agentId: string): AgentTask {
  task.metadata = { ...task.metadata, agentId };
  return task;
}

async function writeSseEvent(res: ServerResponse, event: AgentEvent): Promise<void> {
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

export function createOneAgentHttpServer(options: OneAgentHttpServerOptions): Server {
  const { runtime, logger } = options;

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const method = req.method ?? "GET";
    const pathname = url.pathname;

    try {
      if (!checkAuth(req, options.authToken)) {
        writeJson(res, 401, { error: "Unauthorized" });
        return;
      }

      if (method === "GET" && pathname === "/healthz") {
        writeJson(res, 200, {
          status: "ok",
          service: "oneagent",
          version: SERVER_VERSION,
          agents: runtime.profileRegistry.list().length,
        });
        return;
      }

      if (method === "GET" && pathname === "/v1/agents") {
        writeJson(res, 200, { agents: runtime.profileRegistry.list() });
        return;
      }

      const agentShowMatch = pathname.match(/^\/v1\/agents\/([^/]+)$/);
      if (method === "GET" && agentShowMatch) {
        const agentId = decodeURIComponent(agentShowMatch[1] ?? "");
        const profile = runtime.profileRegistry.tryGet(agentId);
        if (!profile) {
          writeJson(res, 404, { error: `Agent not found: ${agentId}` });
          return;
        }
        writeJson(res, 200, {
          id: profile.metadata.id,
          name: profile.metadata.name,
          version: profile.metadata.version,
          execution: profile.spec.execution,
          capabilities: profile.spec.capabilities,
          skills: profile.spec.skills,
          constraints: profile.spec.constraints,
        });
        return;
      }

      const agentRunMatch = pathname.match(/^\/v1\/agents\/([^/]+)\/(run|stream)$/);
      if (method === "POST" && agentRunMatch) {
        const agentId = decodeURIComponent(agentRunMatch[1] ?? "");
        const mode = agentRunMatch[2];
        if (!runtime.profileRegistry.tryGet(agentId)) {
          writeJson(res, 404, { error: `Agent not found: ${agentId}` });
          return;
        }

        const body = await readJsonBody(req);
        const rawTask = body.task ?? body;
        const task = prepareTask(normalizeTask(rawTask, agentId), agentId);
        if (!task.goal.trim()) {
          writeJson(res, 400, { error: "task.goal is required" });
          return;
        }

        const runOptions = (isRecord(body.options) ? body.options : {}) as RunOptions & OneAgentRunOptions;
        const tierOption = typeof body.tier === "string" ? body.tier : runOptions.tier;
        if (tierOption === "standalone" || tierOption === "kernel" || tierOption === "auto") {
          runOptions.tier = tierOption;
        }
        logger.info("agent run", { agentId, taskId: task.taskId, mode, tier: runOptions.tier });

        if (mode === "stream") {
          res.writeHead(200, {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });
          for await (const event of runtime.executor.stream(task, { ...runOptions, agentId })) {
            await writeSseEvent(res, event);
          }
          res.end();
          return;
        }

        const result = await runtime.executor.run(task, { ...runOptions, agentId });
        writeJson(res, 200, { result, agentId, executionTier: result.executionTier });
        return;
      }

      if (method === "POST" && pathname === "/v1/chat") {
        const body = await readJsonBody(req);
        const agentId = typeof body.agentId === "string" ? body.agentId : runtime.config.defaults.agent;
        const goal = typeof body.message === "string" ? body.message : typeof body.goal === "string" ? body.goal : "";
        if (!goal.trim()) {
          writeJson(res, 400, { error: "message or goal is required" });
          return;
        }

        const task = prepareTask(
          normalizeTask(
            {
              taskId: buildTaskId(),
              sessionId: typeof body.sessionId === "string" ? body.sessionId : buildSessionId(),
              actor: isRecord(body.actor) ? body.actor : { userId: "chat-user" },
              goal,
              metadata: isRecord(body.metadata) ? body.metadata : {},
            },
            agentId,
          ),
          agentId,
        );
        const tier = typeof body.tier === "string" ? body.tier : undefined;
        const result = await runtime.executor.run(task, {
          agentId,
          tier: tier === "standalone" || tier === "kernel" || tier === "auto" ? tier : undefined,
        });
        writeJson(res, 200, {
          agentId,
          sessionId: result.sessionId,
          reply: result.finalText,
          executionTier: result.executionTier,
          result,
        });
        return;
      }

      writeJson(res, 404, { error: "Not found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("request failed", { path: pathname, error: message });
      writeJson(res, 500, { error: message });
    }
  });
}

export function listenOneAgentServer(server: Server, port: number, host = "127.0.0.1"): Promise<void> {
  return new Promise((resolve) => {
    server.listen(port, host, () => resolve());
  });
}
