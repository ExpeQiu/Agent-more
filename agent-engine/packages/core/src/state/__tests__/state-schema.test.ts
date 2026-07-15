/**
 * P1-M2: State Schema Tests
 * 测试 TechPackagingState + 子类型的 Zod 验证
 */

import { z } from 'zod';
import {
  // Types
  NodeType,
  NodeStatus,
  SharedDataType,
  InputSource,
  Priority,
  // Schemas
  SharedDataFieldSchema,
  TechPackagingInputSchema,
  NodeExecutionSchema,
  TechPackagingNodeSchema,
  TechPackagingOutputSchema,
  SharedDataSchema,
  TechPackagingStateSchema,
  TechPackagingGraphSchema,
  // Helper functions
  canExecute,
  isCompleted,
  getNextExecutableNode,
  createEmptyState,
  validateState,
  validateInput,
} from '../state-schema';

// Mock zod for when it's not available
const mockZod = (valid: boolean, error?: string) => {
  if (!valid) {
    const err = new z.ZodError([]);
    err.message = error || 'Validation failed';
    return err;
  }
  return null;
};

describe('State Schema Tests', () => {
  describe('SharedDataFieldSchema', () => {
    test('should validate a valid field', () => {
      const field = {
        key: 'testField',
        value: 'test value',
        type: SharedDataType.String,
        priority: Priority.High,
        source: InputSource.LLM,
      };

      const result = SharedDataFieldSchema.safeParse(field);
      expect(result.success).toBe(true);
    });

    test('should reject empty key', () => {
      const field = {
        key: '',
        value: 'test',
        type: SharedDataType.String,
      };

      const result = SharedDataFieldSchema.safeParse(field);
      expect(result.success).toBe(false);
    });
  });

  describe('TechPackagingInputSchema', () => {
    test('should validate technical-doc input', () => {
      const input = {
        taskType: 'technical-doc',
        subjectName: 'Qwen Model',
        targetAudience: 'developer',
        language: 'zh-CN',
        userQuery: '介绍 Qwen 模型的技术架构',
        priorityFields: ['architecture', 'capabilities'],
      };

      const result = TechPackagingInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    test('should use default values', () => {
      const input = {
        taskType: 'technical-doc',
        subjectName: 'Qwen Model',
        userQuery: '介绍 Qwen 模型',
      };

      const result = TechPackagingInputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.targetAudience).toBe('general');
        expect(result.data.language).toBe('zh-CN');
        expect(result.data.priorityFields).toEqual([]);
      }
    });

    test('should reject invalid taskType', () => {
      const input = {
        taskType: 'invalid-task',
        subjectName: 'Qwen Model',
        userQuery: 'test',
      };

      const result = TechPackagingInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('TechPackagingStateSchema', () => {
    test('should validate complete state', () => {
      const state = {
        executionId: 'exec-123',
        status: 'running',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        input: {
          taskType: 'technical-doc',
          subjectName: 'Qwen Model',
          userQuery: '介绍 Qwen',
        },
        nodes: [
          {
            id: 'node-1',
            type: NodeType.LLM,
            name: 'Generate Introduction',
            config: { model: 'qwen-max' },
          },
        ],
        pendingNodeIds: ['node-1'],
        completedNodeIds: [],
        failedNodeIds: [],
        nodeExecutions: {},
        sharedData: {
          fields: {},
          version: 1,
        },
      };

      const result = TechPackagingStateSchema.safeParse(state);
      expect(result.success).toBe(true);
    });
  });

  describe('Helper Functions', () => {
    test('canExecute should return true for runnable state', () => {
      const state = {
        executionId: 'exec-123',
        status: 'running' as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        input: {
          taskType: 'technical-doc' as const,
          subjectName: 'Test',
          userQuery: 'test',
          priorityFields: [],
        },
        nodes: [],
        pendingNodeIds: ['node-1'],
        runningNodeId: undefined,
        completedNodeIds: [],
        failedNodeIds: [],
        nodeExecutions: {},
        sharedData: { fields: {}, version: 1 },
      };

      expect(canExecute(state)).toBe(true);
    });

    test('canExecute should return false when no pending nodes', () => {
      const state = {
        executionId: 'exec-123',
        status: 'running' as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        input: {
          taskType: 'technical-doc' as const,
          subjectName: 'Test',
          userQuery: 'test',
          priorityFields: [],
        },
        nodes: [],
        pendingNodeIds: [],
        runningNodeId: undefined,
        completedNodeIds: [],
        failedNodeIds: [],
        nodeExecutions: {},
        sharedData: { fields: {}, version: 1 },
      };

      expect(canExecute(state)).toBe(false);
    });

    test('isCompleted should return true for completed/failed/cancelled', () => {
      const completed = { status: 'completed' as const };
      const failed = { status: 'failed' as const };
      const cancelled = { status: 'cancelled' as const };

      expect(isCompleted(completed)).toBe(true);
      expect(isCompleted(failed)).toBe(true);
      expect(isCompleted(cancelled)).toBe(true);
    });

    test('createEmptyState should create valid state', () => {
      const input = {
        taskType: 'technical-doc' as const,
        subjectName: 'Test',
        userQuery: 'test',
      };

      const state = createEmptyState('exec-123', input);

      expect(state.executionId).toBe('exec-123');
      expect(state.status).toBe('idle');
      expect(state.input).toEqual(input);
      expect(state.nodes).toEqual([]);
      expect(state.pendingNodeIds).toEqual([]);
    });

    test('validateState should validate state correctly', () => {
      const validState = {
        executionId: 'exec-123',
        status: 'idle' as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        input: {
          taskType: 'technical-doc' as const,
          subjectName: 'Test',
          userQuery: 'test',
        },
        nodes: [],
        pendingNodeIds: [],
        completedNodeIds: [],
        failedNodeIds: [],
        nodeExecutions: {},
        sharedData: { fields: {}, version: 1 },
      };

      const result = validateState(validState);
      expect(result.valid).toBe(true);
    });
  });
});
