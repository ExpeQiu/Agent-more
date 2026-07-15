import type { AgentTask, ContextRef } from "core-agent";

export type OneAgentRunRequest = {
  agentId: string;
  goal: string;
  tier?: "standalone" | "kernel" | "auto";
  sessionId?: string;
  actor?: AgentTask["actor"];
  contextRefs?: ContextRef[];
  metadata?: Record<string, unknown>;
  personaOverrides?: Record<string, string>;
};

export type OneAgentClientOptions = {
  baseUrl: string;
  authToken?: string;
  fetchImpl?: typeof fetch;
};

export class OneAgentClient {
  private readonly fetchImpl: typeof fetch;
  private readonly headers: Record<string, string>;

  constructor(private readonly options: OneAgentClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.headers = { "Content-Type": "application/json" };
    if (options.authToken) {
      this.headers.Authorization = `Bearer ${options.authToken}`;
    }
  }

  async listAgents(): Promise<{ agents: Array<{ id: string; name: string; version: string }> }> {
    const response = await this.fetchImpl(`${this.options.baseUrl}/v1/agents`, { headers: this.headers });
    if (!response.ok) {
      throw new Error(`listAgents failed: ${response.status}`);
    }
    return response.json() as Promise<{ agents: Array<{ id: string; name: string; version: string }> }>;
  }

  async run(request: OneAgentRunRequest): Promise<{ result: { finalText?: string; sessionId: string }; agentId: string }> {
    const response = await this.fetchImpl(`${this.options.baseUrl}/v1/agents/${encodeURIComponent(request.agentId)}/run`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        tier: request.tier,
        task: {
          goal: request.goal,
          sessionId: request.sessionId,
          actor: request.actor ?? { userId: "sdk-client" },
          contextRefs: request.contextRefs,
          metadata: {
            ...request.metadata,
            personaOverrides: request.personaOverrides,
          },
        },
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`run failed: ${response.status} ${body}`);
    }
    return response.json() as Promise<{ result: { finalText?: string; sessionId: string }; agentId: string }>;
  }

  async chat(message: string, options: { agentId?: string; sessionId?: string } = {}): Promise<{ reply?: string; sessionId: string }> {
    const response = await this.fetchImpl(`${this.options.baseUrl}/v1/chat`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        message,
        agentId: options.agentId,
        sessionId: options.sessionId,
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`chat failed: ${response.status} ${body}`);
    }
    return response.json() as Promise<{ reply?: string; sessionId: string }>;
  }
}
