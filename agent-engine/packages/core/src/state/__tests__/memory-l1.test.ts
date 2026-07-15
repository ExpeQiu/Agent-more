/**
 * P1-M2: L1 Memory Tests
 * 测试单次执行内数据正确读写
 */

import {
  L1Memory,
  getGlobalL1Memory,
  resetGlobalL1Memory,
  type L1MemoryConfig,
} from '../memory-l1';
import type { TechPackagingState } from '../state-schema';
import { NodeType, InputSource, Priority } from '../state-schema';

describe('L1Memory Tests', () => {
  let memory: L1Memory;

  beforeEach(() => {
    memory = new L1Memory({
      maxEntries: 100,
      maxMemoryBytes: 10 * 1024 * 1024, // 10MB
      ttlMs: 60000, // 1 minute
      autoCleanup: true,
      cleanupThreshold: 0.8,
    });
  });

  describe('Basic Operations', () => {
    test('should set and get values', () => {
      memory.set('key1', 'value1');
      expect(memory.get('key1')).toBe('value1');
    });

    test('should return undefined for non-existent keys', () => {
      expect(memory.get('nonexistent')).toBeUndefined();
    });

    test('should check existence with has()', () => {
      memory.set('key1', 'value1');
      expect(memory.has('key1')).toBe(true);
      expect(memory.has('nonexistent')).toBe(false);
    });

    test('should delete entries', () => {
      memory.set('key1', 'value1');
      expect(memory.delete('key1')).toBe(true);
      expect(memory.has('key1')).toBe(false);
    });

    test('should clear all entries', () => {
      memory.set('key1', 'value1');
      memory.set('key2', 'value2');
      memory.clear();
      expect(memory.size()).toBe(0);
    });
  });

  describe('Session Management', () => {
    test('should begin and end session', () => {
      memory.beginSession('exec-123');
      memory.set('key1', 'value1');
      memory.set('key2', 'value2');

      const entries = memory.endSession();
      expect(entries.size).toBe(2);
      expect(entries.has('key1')).toBe(true);
      expect(entries.has('key2')).toBe(true);
    });

    test('should start fresh on new session', () => {
      memory.beginSession('exec-123');
      memory.set('key1', 'value1');

      memory.beginSession('exec-456');
      expect(memory.size()).toBe(0);
    });
  });

  describe('Batch Operations', () => {
    test('should set many items', () => {
      memory.setMany([
        { key: 'k1', value: 'v1' },
        { key: 'k2', value: 'v2' },
        { key: 'k3', value: 'v3' },
      ]);

      expect(memory.size()).toBe(3);
      expect(memory.get('k1')).toBe('v1');
      expect(memory.get('k2')).toBe('v2');
      expect(memory.get('k3')).toBe('v3');
    });

    test('should get many items', () => {
      memory.setMany([
        { key: 'k1', value: 'v1' },
        { key: 'k2', value: 'v2' },
      ]);

      const results = memory.getMany(['k1', 'k2', 'k3']);
      expect(results.get('k1')).toBe('v1');
      expect(results.get('k2')).toBe('v2');
      expect(results.get('k3')).toBeUndefined();
    });
  });

  describe('Metadata', () => {
    test('should store metadata with values', () => {
      memory.set('key1', 'value1', { source: 'llm', priority: 1 });
      const entry = memory.get('key1');
      expect(entry).toBe('value1');
    });
  });

  describe('Recent and Most Accessed', () => {
    test('should get recent entries', () => {
      memory.set('key1', 'value1');
      memory.set('key2', 'value2');
      memory.set('key3', 'value3');

      const recent = memory.getRecent(2);
      expect(recent.length).toBeLessThanOrEqual(2);
      // Most recent first
      expect(recent[0].key).toBe('key3');
    });

    test('should get most accessed entries', () => {
      memory.set('key1', 'value1');
      memory.set('key2', 'value2');

      // Access key1 multiple times
      memory.get('key1');
      memory.get('key1');
      memory.get('key1');

      const mostAccessed = memory.getMostAccessed(1);
      expect(mostAccessed[0].key).toBe('key1');
      expect(mostAccessed[0].accessCount).toBeGreaterThan(1);
    });
  });

  describe('Search', () => {
    test('should search keys by prefix', () => {
      memory.set('shared_content', 'value1');
      memory.set('shared_config', 'value2');
      memory.set('node_output', 'value3');

      const results = memory.searchKeys('shared_');
      expect(results).toContain('shared_content');
      expect(results).toContain('shared_config');
      expect(results).not.toContain('node_output');
    });
  });

  describe('Import from State', () => {
    test('should import sharedData from TechPackagingState', () => {
      const state: TechPackagingState = {
        executionId: 'exec-123',
        status: 'running',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        input: {
          taskType: 'technical-doc',
          subjectName: 'Test',
          userQuery: 'test',
        },
        nodes: [],
        pendingNodeIds: [],
        completedNodeIds: [],
        failedNodeIds: [],
        nodeExecutions: {
          'node-1': {
            nodeId: 'node-1',
            nodeType: NodeType.LLM,
            status: 'completed',
            output: { result: 'output1' },
          },
        },
        sharedData: {
          fields: {
            title: {
              key: 'title',
              value: 'Introduction to Qwen',
              type: 'string',
              priority: Priority.High,
              source: InputSource.LLM,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
            content: {
              key: 'content',
              value: 'Very long content...',
              type: 'text',
              priority: Priority.Medium,
              source: InputSource.Context,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          },
          version: 1,
        },
      };

      memory.importFromState(state);

      expect(memory.get('shared_title')).toBe('Introduction to Qwen');
      expect(memory.get('shared_content')).toBe('Very long content...');
      expect(memory.get('node_node-1_output')).toEqual({ result: 'output1' });
    });
  });

  describe('Stats', () => {
    test('should return correct stats', () => {
      memory.set('key1', 'value1');
      memory.set('key2', 'value2');

      const stats = memory.getStats();
      expect(stats.size).toBe(2);
      expect(stats.maxEntries).toBe(100);
      expect(stats.maxMemoryBytes).toBe(10 * 1024 * 1024);
      expect(stats.usageRatio).toBe(0.02);
    });
  });

  describe('TTL and Expiration', () => {
    test('should expire entries after TTL', async () => {
      const shortTtlMemory = new L1Memory({
        ttlMs: 100, // 100ms TTL
        autoCleanup: false,
      });

      shortTtlMemory.set('key1', 'value1');

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(shortTtlMemory.get('key1')).toBeUndefined();
    });
  });

  describe('Global Instance', () => {
    test('should provide global instance', () => {
      const global1 = getGlobalL1Memory();
      const global2 = getGlobalL1Memory();
      expect(global1).toBe(global2);
    });

    test('should reset global instance', () => {
      resetGlobalL1Memory();
      const fresh = getGlobalL1Memory();
      expect(fresh.size()).toBe(0);
    });
  });
});
