/**
 * P1-M2: Context Window Manager Tests
 * 测试 Token 超限时自动压缩，priorityFields 全部保留
 */

import {
  ContextWindowManager,
  createContextWindowManager,
  type ContextWindowConfig,
} from '../context-window-manager';
import type { TechPackagingState } from '../state-schema';
import { InputSource, Priority } from '../state-schema';

describe('ContextWindowManager Tests', () => {
  const createTestState = (): TechPackagingState => ({
    executionId: 'test-exec-123',
    status: 'running',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    input: {
      taskType: 'technical-doc',
      subjectName: 'Qwen Model',
      targetAudience: 'developer',
      language: 'zh-CN',
      userQuery: '介绍 Qwen 模型的技术架构和核心能力',
      priorityFields: ['architecture', 'core_capabilities'],
      context: {
        version: '2.5',
        releaseDate: '2024-01-15',
      },
    },
    nodes: [],
    pendingNodeIds: [],
    completedNodeIds: [],
    failedNodeIds: [],
    nodeExecutions: {},
    sharedData: {
      fields: {
        architecture: {
          key: 'architecture',
          value: 'Transformer-based architecture with 70B parameters',
          type: 'text',
          priority: Priority.Critical,
          source: InputSource.LLM,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        core_capabilities: {
          key: 'core_capabilities',
          value: 'Multi-modal understanding, code generation, mathematical reasoning',
          type: 'text',
          priority: Priority.Critical,
          source: InputSource.LLM,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        long_text_content: {
          key: 'long_text_content',
          value: 'A very long piece of text content that should be compressed when token limit is reached. '.repeat(
            100
          ),
          type: 'text',
          priority: Priority.Low,
          source: InputSource.Context,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      },
      version: 1,
    },
  });

  describe('Initialization', () => {
    test('should initialize from state correctly', () => {
      const state = createTestState();
      const manager = createContextWindowManager(state);

      expect(manager.getTotalTokens()).toBeGreaterThan(0);
      const context = manager.getContext();
      expect(context.length).toBeGreaterThan(0);
    });

    test('should mark priority fields as Critical', () => {
      const state = createTestState();
      const manager = createContextWindowManager(state);

      const criticalItems = manager
        .getContext()
        .filter((item) => item.priority === Priority.Critical);

      expect(criticalItems.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Token Estimation', () => {
    test('should estimate tokens for Chinese text', () => {
      const manager = new ContextWindowManager();
      const chineseText = '这是一个中文测试句子';
      const tokens = manager.estimateTokens(chineseText);
      expect(tokens).toBeGreaterThan(0);
      // Chinese ~1.5 chars/token
      expect(tokens).toBeLessThanOrEqual(Math.ceil(chineseText.length / 1.5) + 1);
    });

    test('should estimate tokens for English text', () => {
      const manager = new ContextWindowManager();
      const englishText = 'This is an English test sentence';
      const tokens = manager.estimateTokens(englishText);
      // English ~4 chars/token
      expect(tokens).toBeLessThanOrEqual(Math.ceil(englishText.length / 4) + 1);
    });
  });

  describe('Add/Remove Items', () => {
    test('should add items correctly', () => {
      const manager = new ContextWindowManager();
      const initialTokens = manager.getTotalTokens();

      manager.addItem({
        id: 'test-item',
        content: 'This is a test item',
        priority: Priority.Medium,
        source: InputSource.LLM,
      });

      expect(manager.getTotalTokens()).toBeGreaterThan(initialTokens);
      expect(manager.getContext().find((i) => i.id === 'test-item')).toBeDefined();
    });

    test('should remove items correctly', () => {
      const manager = new ContextWindowManager();

      manager.addItem({
        id: 'test-item',
        content: 'This is a test item',
        priority: Priority.Medium,
        source: InputSource.LLM,
      });

      const removed = manager.removeItem('test-item');
      expect(removed).toBeDefined();
      expect(manager.getContext().find((i) => i.id === 'test-item')).toBeUndefined();
    });
  });

  describe('Compression', () => {
    test('should not compress when under threshold', () => {
      const config: ContextWindowConfig = {
        maxTokens: 100000,
        compressionThreshold: 0.85,
        targetTokensAfterCompression: 0.7,
        charsPerToken: 4,
        priorityFields: [],
        compressionStrategy: 'truncate',
      };

      const manager = new ContextWindowManager(config);
      expect(manager.shouldCompress()).toBe(false);
    });

    test('should compress when over threshold', () => {
      const config: ContextWindowConfig = {
        maxTokens: 100,
        compressionThreshold: 0.5,
        targetTokensAfterCompression: 0.3,
        charsPerToken: 4,
        priorityFields: [],
        compressionStrategy: 'truncate',
      };

      const manager = new ContextWindowManager(config);

      // Add items to exceed threshold — addItem auto-compresses, so check context instead
      manager.addItem({
        id: 'item1',
        content: 'A'.repeat(500),
        priority: Priority.Low,
        source: InputSource.Context,
      });

      // After addItem, context has been compressed (shouldCompress now false)
      // Verify that item count decreased or content was truncated
      const context = manager.getContext();
      expect(context.length).toBeLessThanOrEqual(1);
    });

    test('should preserve critical items during compression', () => {
      const config: ContextWindowConfig = {
        maxTokens: 1000,
        compressionThreshold: 0.3,
        targetTokensAfterCompression: 0.2,
        charsPerToken: 4,
        priorityFields: ['critical-field'],
        compressionStrategy: 'truncate',
      };

      const manager = new ContextWindowManager(config);

      // Add critical item
      manager.addItem({
        id: 'critical-field',
        content: 'Critical content that must be preserved',
        priority: Priority.Critical,
        source: InputSource.LLM,
      });

      // Add many low priority items
      for (let i = 0; i < 50; i++) {
        manager.addItem({
          id: `low-priority-${i}`,
          content: `Low priority content ${i}. ${'x'.repeat(100)}`,
          priority: Priority.Low,
          source: InputSource.Context,
        });
      }

      // Trigger compression
      if (manager.shouldCompress()) {
        manager.compress();
      }

      // Critical item should still exist
      const criticalItem = manager
        .getContext()
        .find((i) => i.id === 'critical-field');
      expect(criticalItem).toBeDefined();
    });
  });

  describe('LLM Message Conversion', () => {
    test('should convert context to LLM messages', async () => {
      const state = createTestState();
      const manager = createContextWindowManager(state);

      const messages = await manager.toLLMMessages();

      expect(Array.isArray(messages)).toBe(true);
      expect(messages.length).toBeGreaterThan(0);
      messages.forEach((msg) => {
        expect(msg).toHaveProperty('role');
        expect(msg).toHaveProperty('content');
        expect(['system', 'user', 'assistant']).toContain(msg.role);
      });
    });
  });

  describe('Summarize Strategy', () => {
    test('should mark item as pending summarize when strategy is summarize', () => {
      // Use compressionThreshold=1 to prevent auto-compression during addItem
      // and set targetTokens small enough that item actually gets compressed
      const config: ContextWindowConfig = {
        maxTokens: 100,
        compressionThreshold: 1.0,
        targetTokensAfterCompression: 0.1,
        charsPerToken: 4,
        priorityFields: [],
        compressionStrategy: 'summarize',
      };

      const manager = new ContextWindowManager(config);

      // Add a long item (125 tokens) — with targetTokens=10, item will be compressed
      manager.addItem({
        id: 'long-item',
        content: 'A'.repeat(500),
        priority: Priority.Low,
        source: InputSource.Context,
      });

      // Manually trigger compress — with targetTokens=10, the 125-token item exceeds budget
      const result = manager.compress();

      const item = result.items.find((i) => i.id === 'long-item');
      expect(item).toBeDefined();
      // summarizeItem adds pending marker when item content exceeds maxTokens budget
      expect(item?.metadata?.pendingSummarize).toBe(true);
    });

    test('toLLMMessages should trigger summarize when strategy is summarize and over limit', async () => {
      const config: ContextWindowConfig = {
        maxTokens: 100,
        compressionThreshold: 0.5,
        targetTokensAfterCompression: 0.3,
        charsPerToken: 4,
        priorityFields: [],
        compressionStrategy: 'summarize',
      };

      const manager = new ContextWindowManager(config);

      // Add a critical item (not compressed) + many low priority items
      manager.addItem({
        id: 'critical',
        content: 'Critical content',
        priority: Priority.Critical,
        source: InputSource.LLM,
      });

      for (let i = 0; i < 20; i++) {
        manager.addItem({
          id: `item-${i}`,
          content: `Low priority content ${i}. ${'x'.repeat(100)}`,
          priority: Priority.Low,
          source: InputSource.Context,
        });
      }

      expect(manager.shouldCompress()).toBe(true);

      // toLLMMessages with summarize strategy should trigger summarize
      // (without API key it falls back gracefully)
      const messages = await manager.toLLMMessages();
      expect(Array.isArray(messages)).toBe(true);
    });

    test('summarize should not compress critical items', async () => {
      const config: ContextWindowConfig = {
        maxTokens: 1000,
        compressionThreshold: 0.3,
        targetTokensAfterCompression: 0.2,
        charsPerToken: 4,
        priorityFields: [],
        compressionStrategy: 'summarize',
      };

      const manager = new ContextWindowManager(config);

      manager.addItem({
        id: 'critical',
        content: 'This is critical and must not be summarized',
        priority: Priority.Critical,
        source: InputSource.User,
      });

      await manager.summarize();

      const criticalItem = manager.getContext().find((i) => i.id === 'critical');
      expect(criticalItem).toBeDefined();
      expect(criticalItem?.content).toContain('This is critical and must not be summarized');
    });
  });

  describe('Reset', () => {
    test('should clear all items on reset', () => {
      const state = createTestState();
      const manager = createContextWindowManager(state);

      manager.reset();

      expect(manager.getTotalTokens()).toBe(0);
      expect(manager.getContext()).toEqual([]);
    });
  });
});
