/**
 * MCP 子进程生命周期占位：与 Tool Orchestrator 解耦，后续可接入 stdio/SSE transport。
 * @package @enterprise-claw/mcp-client
 */
export interface McpServerHandle {
  readonly id: string;
  shutdown(): Promise<void>;
}

export class McpProcessManager {
  private readonly servers = new Map<string, McpServerHandle>();

  registerStub(id: string): McpServerHandle {
    const handle: McpServerHandle = {
      id,
      shutdown: async () => {
        this.servers.delete(id);
      },
    };
    this.servers.set(id, handle);
    return handle;
  }

  list(): string[] {
    return [...this.servers.keys()];
  }
}
