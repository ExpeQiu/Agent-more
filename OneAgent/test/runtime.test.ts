import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createOneAgentRuntime } from "../src/bootstrap/create-runtime.js";
import { enrichTaskWithProfile } from "../src/profile/task-enricher.js";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));

describe("runtime integration", () => {
  it("loads profiles and injects reviewer persona", async () => {
    const runtime = await createOneAgentRuntime({
      cwd: rootDir,
      mockMode: true,
    });

    expect(runtime.profileRegistry.list().map((item) => item.id)).toContain("reviewer");
    expect(runtime.skillRegistry.list().length).toBeGreaterThan(0);

    const result = await runtime.executor.run(
      {
        taskId: "test_task",
        actor: { userId: "tester" },
        goal: "审阅文档",
        metadata: { agentId: "reviewer", personaOverrides: { "style.tone": "严谨" } },
      },
      { agentId: "reviewer", tier: "standalone" },
    );
    expect(result.status).toBe("completed");
    expect(result.executionTier).toBe("standalone");
    expect(result.finalText).toContain("[mock]");
  });
});
