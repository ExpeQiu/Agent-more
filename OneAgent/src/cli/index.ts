#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Command } from "commander";
import { createOneAgentRuntime } from "../bootstrap/create-runtime.js";
import { loadConfig } from "../config/load-config.js";
import { createLogger } from "../logging/logger.js";
import { startOneAgentMcpStdio } from "../mcp/create-mcp-server.js";
import { createOneAgentHttpServer, listenOneAgentServer } from "../server/http-server.js";
import type { ExecutionTier } from "../types/execution.js";

const program = new Command();

program.name("oneagent").description("Copilot-style auxiliary agent with persona and skills");

program
  .command("serve")
  .description("启动 HTTP 服务")
  .option("-p, --port <number>", "监听端口")
  .option("-c, --config <path>", "配置文件路径")
  .action(async (options: { port?: string; config?: string }) => {
    const runtime = await createOneAgentRuntime({ configPath: options.config });
    const port = Number(options.port ?? runtime.config.server.port);
    const logger = createLogger({ level: runtime.config.logging.level, file: runtime.config.logging.file, scope: "http" });
    const server = createOneAgentHttpServer({
      runtime,
      logger,
      authToken: runtime.config.server.gatewayToken,
    });
    await listenOneAgentServer(server, port);
    logger.info("OneAgent HTTP server listening", { url: `http://127.0.0.1:${port}` });
  });

program
  .command("run")
  .description("单次执行任务")
  .requiredOption("-g, --goal <text>", "任务目标")
  .option("-a, --agent <id>", "Agent ID", "copilot")
  .option("-t, --tier <tier>", "执行层级: standalone | kernel | auto")
  .option("-c, --config <path>", "配置文件路径")
  .option("--mock", "强制 Mock 模式")
  .action(async (options: { goal: string; agent: string; tier?: string; config?: string; mock?: boolean }) => {
    const runtime = await createOneAgentRuntime({ configPath: options.config, mockMode: options.mock });
    const tier = options.tier as ExecutionTier | undefined;
    const result = await runtime.executor.run(
      {
        taskId: `cli_${Date.now()}`,
        actor: { userId: "cli-user" },
        goal: options.goal,
        metadata: { agentId: options.agent },
      },
      { agentId: options.agent, tier },
    );
    console.log(`[${result.executionTier}] ${result.finalText ?? JSON.stringify(result, null, 2)}`);
  });

program
  .command("chat")
  .description("交互式多轮对话")
  .option("-a, --agent <id>", "Agent ID", "copilot")
  .option("-s, --session <id>", "会话 ID")
  .option("-c, --config <path>", "配置文件路径")
  .option("--mock", "强制 Mock 模式")
  .action(async (options: { agent: string; session?: string; config?: string; mock?: boolean }) => {
    const runtime = await createOneAgentRuntime({ configPath: options.config, mockMode: options.mock });
    const rl = createInterface({ input, output });
    let sessionId = options.session ?? `chat_${Date.now()}`;
    console.log(`OneAgent chat — agent=${options.agent}, session=${sessionId}. 输入 exit 退出。`);

    while (true) {
      const goal = await rl.question("> ");
      if (!goal.trim() || goal.trim().toLowerCase() === "exit") {
        break;
      }
      const result = await runtime.executor.run(
        {
          taskId: `chat_${Date.now()}`,
          sessionId,
          actor: { userId: "chat-user" },
          goal,
          metadata: { agentId: options.agent },
        },
        { agentId: options.agent },
      );
      sessionId = result.sessionId;
      console.log(`[${result.executionTier}] ${result.finalText ?? "[no text response]"}`);
    }

    rl.close();
  });

const agents = program.command("agents").description("Agent Profile 管理");

agents
  .command("list")
  .option("-c, --config <path>", "配置文件路径")
  .action(async (options: { config?: string }) => {
    const config = loadConfig({ configPath: options.config });
    const runtime = await createOneAgentRuntime({ configPath: options.config, mockMode: true });
    for (const item of runtime.profileRegistry.list()) {
      console.log(`${item.id}\t${item.name}\tv${item.version}`);
    }
    console.log(`\nagents dir: ${config.agents.dir}`);
  });

agents
  .command("show")
  .argument("<agentId>", "Agent ID")
  .option("-c, --config <path>", "配置文件路径")
  .action(async (agentId: string, options: { config?: string }) => {
    const runtime = await createOneAgentRuntime({ configPath: options.config, mockMode: true });
    const profile = runtime.profileRegistry.get(agentId);
    console.log(JSON.stringify(profile, null, 2));
  });

agents
  .command("validate")
  .option("-c, --config <path>", "配置文件路径")
  .action(async (options: { config?: string }) => {
    const runtime = await createOneAgentRuntime({ configPath: options.config, mockMode: true });
    const result = runtime.profileRegistry.validateAll();
    if (!result.ok) {
      for (const error of result.errors) {
        console.error(error);
      }
      process.exitCode = 1;
      return;
    }
    console.log("All agent profiles are valid.");
  });

const skills = program.command("skills").description("Skills 管理");

skills
  .command("list")
  .option("-c, --config <path>", "配置文件路径")
  .action(async (options: { config?: string }) => {
    const runtime = await createOneAgentRuntime({ configPath: options.config, mockMode: true });
    for (const item of runtime.skillRegistry.list()) {
      console.log(`${item.id}\t${item.name}\troles=${item.roles.join(",") || "*"}`);
    }
  });

program
  .command("config")
  .description("显示当前配置")
  .option("-c, --config <path>", "配置文件路径")
  .action((options: { config?: string }) => {
    const config = loadConfig({ configPath: options.config });
    console.log(JSON.stringify(config, null, 2));
  });

const mcp = program.command("mcp").description("MCP Server");

mcp
  .command("serve")
  .description("启动 MCP stdio 服务（IDE / Agent 客户端）")
  .option("-c, --config <path>", "配置文件路径")
  .option("--mock", "强制 Mock 模式")
  .action(async (options: { config?: string; mock?: boolean }) => {
    const runtime = await createOneAgentRuntime({ configPath: options.config, mockMode: options.mock });
    const logger = createLogger({
      level: runtime.config.logging.level,
      file: runtime.config.logging.file,
      scope: "mcp",
    });
    await startOneAgentMcpStdio(runtime, logger);
  });

program.parseAsync(process.argv).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[oneagent] ${message}`);
  process.exitCode = 1;
});
