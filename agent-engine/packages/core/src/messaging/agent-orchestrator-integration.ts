/**
 * AgentOrchestrator 集成参考
 * 描述如何将 AgentMessageBus 集成到现有的 AgentOrchestrator 中
 *
 * 来源：TD-B10：引入 AgentMessageBus 多 Agent 消息总线
 * 生成时间：2026-04-26
 *
 * =========== 集成前：现状（工具参数隐式传递）===========
 *
 * // 现状代码（示例）
 * class AgentOrchestrator {
 *   async executeToolCall(agentId: string, toolName: string, params: object) {
 *     if (toolName === 'Consult_Tech') {
 *       const techAgent = this.getAgent('tech');
 *       return await techAgent.consult(params);
 *     }
 *     if (toolName === 'Consult_Scene') {
 *       const sceneAgent = this.getAgent('scene');
 *       return await sceneAgent.consult(params);
 *     }
 *   }
 * }
 *
 * 问题：Agent 间耦合在 toolName 字符串中，上下文污染风险
 *
 * =========== 集成后：消息总线解耦 ===========
 *
 * // 步骤 1：在 AgentOrchestrator 初始化时注入消息总线
 * import { getDefaultMessageBus } from './messaging';
 *
 * class AgentOrchestrator {
 *   private messageBus = getDefaultMessageBus();
 *
 *   // 步骤 2：将工具调用替换为消息总线发布
 *   async executeToolCall(agentId: string, toolName: string, params: object) {
 *     const channel = this.toolToChannel(toolName); // e.g. 'tool:consult_tech'
 *
 *     const message: AgentMessage = {
 *       id: generateId(),
 *       type: 'request',
 *       channel,
 *       from: agentId,
 *       payload: { toolName, params },
 *       timestamp: Date.now(),
 *     };
 *
 *     // 发布到消息总线，等待响应
 *     const result = await this.messageBus.request(channel, message, 60_000);
 *     return result;
 *   }
 *
 *   // 步骤 3：各子 Agent 订阅自己感兴趣的 channel
 *   registerAgent(agentId: string, channels: string[]) {
 *     for (const channel of channels) {
 *       this.messageBus.subscribe(channel, async (msg) => {
 *         if (msg.type === 'request') {
 *           const { toolName, params } = msg.payload as any;
 *           const result = await this.routeToHandler(agentId, toolName, params);
 *           // 响应
 *           await this.messageBus.respond(msg, { result });
 *         }
 *       });
 *     }
 *   }
 *
 *   // 工具名到 channel 的映射
 *   private toolToChannel(toolName: string): string {
 *     const map: Record<string, string> = {
 *       Consult_Tech: 'agent:tech',
 *       Consult_Scene: 'agent:scene',
 *       // 新增工具只需改这里
 *     };
 *     return map[toolName] || `tool:${toolName}`;
 *   }
 * }
 *
 * =========== 频道命名规范 ============
 *
 * | 频道前缀    | 用途                    | 示例                      |
 * |-----------|------------------------|--------------------------|
 * | agent:    | Agent 间协作请求         | agent:tech, agent:scene  |
 * | tool:     | 工具调用解耦             | tool:consult_tech        |
 * | broadcast:| 全局广播（无特定接收者）   | broadcast:system_event  |
 * | response: | 响应专用（一般不手动订阅）  | （自动路由）              |
 *
 * =========== 不破坏现有流程的关键 ============
 *
 * 1. 现有 Agent.executeToolCall() 逻辑保持不变
 * 2. AgentMessageBus.publish() 是异步非阻塞的，调用方无感知
 * 3. 响应通过 respond() 方法自动匹配原请求
 * 4. 降级策略：如果消息总线不可用（Phase 2 切换时），fallback 到直接调用
 *
 * =========== 迁移检查清单 ============
 *
 * [ ] 新建 packages/core/src/messaging/agent-message-bus.ts
 * [ ] 新建 packages/core/src/messaging/types.ts
 * [ ] 新建 packages/core/src/messaging/index.ts
 * [ ] 在 AgentOrchestrator 构造器中注入 messageBus
 * [ ] 将 Consult_Tech 调用改为 messageBus.request('agent:tech', ...)
 * [ ] 将 Consult_Scene 调用改为 messageBus.request('agent:scene', ...)
 * [ ] 为 tech/scene agent 注册订阅 handler
 * [ ] 添加单元测试（InMemoryAgentMessageBus 可直接 mock）
 * [ ] Phase 2：替换为 RedisAgentMessageBus，验证多实例共享
 */
