/**
 * AgentMessageBus 单元测试
 * 测试文件位置：packages/core/src/messaging/__tests__/agent-message-bus.test.ts
 *
 * 运行方式：
 *   npx jest packages/core/src/messaging/__tests__/agent-message-bus.test.ts
 *
 * 来源：TD-B10：引入 AgentMessageBus 多 Agent 消息总线
 * 生成时间：2026-04-26
 */

import {
  InMemoryAgentMessageBus,
  resetDefaultMessageBus,
  type AgentMessage,
} from '../agent-message-bus';

function makeMsg(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    id: `test-${Math.random().toString(36).slice(2)}`,
    type: 'request',
    channel: 'test',
    from: 'test-agent',
    payload: {},
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('InMemoryAgentMessageBus', () => {
  let bus: InMemoryAgentMessageBus;

  beforeEach(() => {
    bus = new InMemoryAgentMessageBus();
  });

  afterEach(() => {
    bus.clear();
  });

  // ---- publish / subscribe 基本流程 ----

  it('should deliver message to subscriber', async () => {
    const received: AgentMessage[] = [];
    bus.subscribe('tech-question', (msg) => received.push(msg));

    await bus.publish('tech-question', makeMsg({ channel: 'tech-question' }));

    expect(received).toHaveLength(1);
    expect(received[0].channel).toBe('tech-question');
  });

  it('should support multiple subscribers on same channel', async () => {
    const received1: AgentMessage[] = [];
    const received2: AgentMessage[] = [];
    bus.subscribe('tech-question', (msg) => received1.push(msg));
    bus.subscribe('tech-question', (msg) => received2.push(msg));

    await bus.publish('tech-question', makeMsg({ channel: 'tech-question' }));

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);
  });

  it('should NOT deliver to subscribers of other channels', async () => {
    const received: AgentMessage[] = [];
    bus.subscribe('tech-question', (msg) => received.push(msg));

    await bus.publish('other-channel', makeMsg({ channel: 'other-channel' }));

    expect(received).toHaveLength(0);
  });

  it('should skip expired messages based on TTL', async () => {
    const received: AgentMessage[] = [];
    bus.subscribe('test', (msg) => received.push(msg));

    // 消息已过期（timestamp 早于 now - ttl）
    await bus.publish('test', makeMsg({
      channel: 'test',
      timestamp: Date.now() - 10_000,
      ttl: 5_000, // 5s TTL，已过期
    }));

    expect(received).toHaveLength(0);
  });

  // ---- unsubscribe ----

  it('should remove subscriber on unsubscribe', async () => {
    const received: AgentMessage[] = [];
    const unsubscribe = bus.subscribe('test', (msg) => received.push(msg));

    await bus.publish('test', makeMsg({ channel: 'test' }));
    expect(received).toHaveLength(1);

    unsubscribe();

    await bus.publish('test', makeMsg({ channel: 'test' }));
    expect(received).toHaveLength(1); // 未增加
  });

  it('should handle publish with no subscribers gracefully', async () => {
    // 不应抛出
    await expect(
      bus.publish('no-subscribers', makeMsg({ channel: 'no-subscribers' })),
    ).resolves.not.toThrow();
  });

  // ---- request / respond ----

  it('should resolve request() with response payload', async () => {
    bus.subscribe('tech-question', async (msg) => {
      if (msg.type === 'request') {
        await bus.respond(msg, { answer: 'Use React' });
      }
    });

    const result = await bus.request('tech-question', makeMsg({ channel: 'tech-question' }));
    expect(result).toEqual({ answer: 'Use React' });
  });

  it('should timeout if no response', async () => {
    // 不订阅，直接 request，应该超时
    await expect(
      bus.request('never-answered', makeMsg({ channel: 'never-answered' }), 500),
    ).rejects.toThrow(/timeout/i);
  });

  // ---- 扩展方法 ----

  it('hasSubscribers returns true when subscribed', () => {
    bus.subscribe('test', () => {});
    expect(bus.hasSubscribers('test')).toBe(true);
  });

  it('hasSubscribers returns false when no subscription', () => {
    expect(bus.hasSubscribers('empty')).toBe(false);
  });

  it('getSubscriberCount returns correct count', () => {
    bus.subscribe('test', () => {});
    bus.subscribe('test', () => {});
    expect(bus.getSubscriberCount('test')).toBe(2);
  });

  it('getActiveChannels lists only non-empty channels', () => {
    bus.subscribe('ch1', () => {});
    bus.subscribe('ch2', () => {});
    // ch2 unsubscribe immediately
    const unsub = bus.subscribe('ch2', () => {});
    unsub();

    const channels = bus.getActiveChannels();
    expect(channels).toContain('ch1');
    expect(channels).not.toContain('ch2');
  });

  it('respond throws if message has no id', async () => {
    const msg = makeMsg({ id: undefined as any });
    await expect(bus.respond(msg, {})).rejects.toThrow(/without id/);
  });

  // ---- broadcast 类型 ----

  it('should deliver broadcast messages to all subscribers', async () => {
    const received: AgentMessage[] = [];
    bus.subscribe('broadcast:system', (msg) => received.push(msg));

    await bus.publish('broadcast:system', makeMsg({
      channel: 'broadcast:system',
      type: 'broadcast',
    }));

    expect(received).toHaveLength(1);
  });
});
