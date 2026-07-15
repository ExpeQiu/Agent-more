/**
 * P1-M2: State Reducer Tests
 * 测试 override/append/merge/conditional_override 四种策略
 */

import {
  ReduceStrategy,
  stateReducer,
  setSharedData,
  setConditionalSharedData,
  type StateAction,
  type ConditionalOverrideConfig,
} from '../state-reducer';
import type { TechPackagingState } from '../state-schema';
import { NodeType } from '../state-schema';

describe('State Reducer Tests', () => {
  const createTestState = (): TechPackagingState => ({
    executionId: 'test-exec-123',
    status: 'idle',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    input: {
      taskType: 'technical-doc',
      subjectName: 'Test Subject',
      targetAudience: 'developer',
      language: 'zh-CN',
      userQuery: 'Test query',
      priorityFields: [],
    },
    nodes: [
      {
        id: 'node-1',
        type: NodeType.LLM,
        name: 'Generate Intro',
        config: {},
      },
      {
        id: 'node-2',
        type: NodeType.Tool,
        name: 'Format Output',
        config: {},
      },
    ],
    pendingNodeIds: ['node-1', 'node-2'],
    runningNodeId: undefined,
    completedNodeIds: [],
    failedNodeIds: [],
    nodeExecutions: {},
    sharedData: { fields: {}, version: 1 },
  });

  describe('INIT action', () => {
    test('should initialize state correctly', () => {
      const action: StateAction = {
        type: 'INIT',
        payload: {
          executionId: 'exec-456',
          nodes: [
            { id: 'n1', type: NodeType.LLM, name: 'Test', config: {} },
          ],
          input: {
            taskType: 'technical-doc',
            subjectName: 'Test',
            userQuery: 'test',
          },
        },
      };

      const newState = stateReducer(createTestState(), action);

      expect(newState.executionId).toBe('exec-456');
      expect(newState.status).toBe('idle');
      expect(newState.nodes).toHaveLength(1);
      expect(newState.pendingNodeIds).toEqual(['n1']);
      expect(newState.completedNodeIds).toEqual([]);
    });
  });

  describe('START action', () => {
    test('should transition to running status', () => {
      const state = createTestState();
      const action: StateAction = { type: 'START' };

      const newState = stateReducer(state, action);

      expect(newState.status).toBe('running');
      expect(newState.startedAt).toBeDefined();
    });
  });

  describe('NODE_START action', () => {
    test('should move node from pending to running', () => {
      const state = createTestState();
      const action: StateAction = {
        type: 'NODE_START',
        payload: { nodeId: 'node-1' },
      };

      const newState = stateReducer(state, action);

      expect(newState.runningNodeId).toBe('node-1');
      expect(newState.pendingNodeIds).not.toContain('node-1');
      expect(newState.nodeExecutions['node-1']).toBeDefined();
      expect(newState.nodeExecutions['node-1'].status).toBe('running');
    });
  });

  describe('NODE_COMPLETE action', () => {
    test('should mark node as completed and update sharedData', () => {
      const state = {
        ...createTestState(),
        runningNodeId: 'node-1',
        pendingNodeIds: ['node-2'],
        nodeExecutions: {
          'node-1': {
            nodeId: 'node-1',
            nodeType: NodeType.LLM,
            status: 'running' as const,
            retryCount: 0,
          },
        },
      };

      const action: StateAction = {
        type: 'NODE_COMPLETE',
        payload: {
          nodeId: 'node-1',
          output: { result: 'generated content' },
        },
      };

      const newState = stateReducer(state, action);

      expect(newState.runningNodeId).toBeUndefined();
      expect(newState.completedNodeIds).toContain('node-1');
      expect(newState.nodeExecutions['node-1'].status).toBe('completed');
      expect(newState.nodeExecutions['node-1'].output).toEqual({
        result: 'generated content',
      });
    });

    test('should auto-complete when no more pending nodes', () => {
      const state = {
        ...createTestState(),
        runningNodeId: 'node-1',
        pendingNodeIds: [],
        completedNodeIds: ['node-2'],
        nodeExecutions: {
          'node-1': {
            nodeId: 'node-1',
            nodeType: NodeType.LLM,
            status: 'running' as const,
            retryCount: 0,
          },
        },
      };

      const action: StateAction = {
        type: 'NODE_COMPLETE',
        payload: {
          nodeId: 'node-1',
          output: { result: 'done' },
        },
      };

      const newState = stateReducer(state, action);

      expect(newState.status).toBe('completed');
      expect(newState.endedAt).toBeDefined();
    });
  });

  describe('SET_SHARED_DATA with different strategies', () => {
    test('Override strategy - should replace value', () => {
      const state = {
        ...createTestState(),
        sharedData: {
          fields: {
            content: {
              key: 'content',
              value: 'old content',
              type: 'string' as const,
              priority: 3,
              source: 'llm' as const,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          },
          version: 1,
        },
      };

      const action = setSharedData('content', 'new content', ReduceStrategy.Override);

      const newState = stateReducer(state, action);

      expect(newState.sharedData.fields['content'].value).toBe('new content');
      expect(newState.sharedData.version).toBe(2);
    });

    test('Append strategy - should concatenate arrays', () => {
      const state = {
        ...createTestState(),
        sharedData: {
          fields: {
            items: {
              key: 'items',
              value: ['a', 'b'],
              type: 'array' as const,
              priority: 3,
              source: 'llm' as const,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          },
          version: 1,
        },
      };

      const action = setSharedData('items', ['c', 'd'], ReduceStrategy.Append);

      const newState = stateReducer(state, action);

      expect(newState.sharedData.fields['items'].value).toEqual(['a', 'b', 'c', 'd']);
    });

    test('Merge strategy - should deep merge objects', () => {
      const state = {
        ...createTestState(),
        sharedData: {
          fields: {
            config: {
              key: 'config',
              value: { a: 1, b: { c: 2 } },
              type: 'object' as const,
              priority: 3,
              source: 'llm' as const,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          },
          version: 1,
        },
      };

      const action = setSharedData(
        'config',
        { b: { d: 3 }, e: 4 },
        ReduceStrategy.Merge
      );

      const newState = stateReducer(state, action);

      expect(newState.sharedData.fields['config'].value).toEqual({
        a: 1,
        b: { c: 2, d: 3 },
        e: 4,
      });
    });

    test('ConditionalOverride strategy - should apply based on condition', () => {
      const state = {
        ...createTestState(),
        sharedData: {
          fields: {
            status: {
              key: 'status',
              value: 'pending',
              type: 'string' as const,
              priority: 3,
              source: 'llm' as const,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          },
          version: 1,
        },
      };

      const config: ConditionalOverrideConfig = {
        rules: [{ field: 'status', operator: 'eq', value: 'pending' }],
        sourceValue: 'approved',
        targetValue: 'rejected',
      };

      const action = setConditionalSharedData('status', config);

      const newState = stateReducer(state, action);

      // status equals 'pending', so sourceValue 'approved' should be used
      expect(newState.sharedData.fields['status'].value).toBe('approved');
    });
  });

  describe('COMPLETE action', () => {
    test('should mark state as completed', () => {
      const state = createTestState();
      const action: StateAction = { type: 'COMPLETE' };

      const newState = stateReducer(state, action);

      expect(newState.status).toBe('completed');
      expect(newState.endedAt).toBeDefined();
      expect(newState.pendingNodeIds).toEqual([]);
    });
  });

  describe('FAIL action', () => {
    test('should mark state as failed with error', () => {
      const state = createTestState();
      const action: StateAction = {
        type: 'FAIL',
        payload: {
          error: 'Node execution failed',
          details: { nodeId: 'node-1' },
        },
      };

      const newState = stateReducer(state, action);

      expect(newState.status).toBe('failed');
      expect(newState.error).toBe('Node execution failed');
      expect(newState.errorDetails).toEqual({ nodeId: 'node-1' });
    });
  });
});
