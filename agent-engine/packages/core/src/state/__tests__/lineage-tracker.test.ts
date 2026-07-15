/**
 * P1-M2: Lineage Tracker Tests
 * 测试每条 sharedData 字段可追溯生产者节点ID
 */

import {
  LineageTracker,
  LineageOperation,
  getGlobalLineageTracker,
  resetGlobalLineageTracker,
} from '../lineage-tracker';

describe('LineageTracker Tests', () => {
  let tracker: LineageTracker;

  beforeEach(() => {
    tracker = new LineageTracker();
  });

  describe('Basic Operations', () => {
    test('should begin and end execution', () => {
      tracker.beginExecution('exec-123');
      tracker.recordCreate('field1', 'node-1', 'value1');

      const graph = tracker.endExecution();

      expect(graph.nodes.size).toBeGreaterThan(0);
      expect(graph.edges.size).toBeGreaterThan(0);
    });
  });

  describe('Create Operation', () => {
    test('should record field creation with producer node', () => {
      tracker.beginExecution('exec-123');
      const node = tracker.recordCreate('content', 'node-llm-1', 'Generated content');

      expect(node.operation).toBe(LineageOperation.Create);
      expect(node.fieldKey).toBe('content');
      expect(node.targetNodeId).toBe('node-llm-1');

      // Verify producer can be found
      const producerId = tracker.findProducerNodeId('content');
      expect(producerId).toBe('node-llm-1');
    });

    test('should track multiple created fields', () => {
      tracker.beginExecution('exec-123');
      tracker.recordCreate('title', 'node-1', 'Title');
      tracker.recordCreate('body', 'node-1', 'Body content');
      tracker.recordCreate('metadata', 'node-2', { author: 'AI' });

      const title = tracker.findProducerNodeId('title');
      const body = tracker.findProducerNodeId('body');
      const metadata = tracker.findProducerNodeId('metadata');

      expect(title).toBe('node-1');
      expect(body).toBe('node-1');
      expect(metadata).toBe('node-2');
    });
  });

  describe('Read Operation', () => {
    test('should record field read', () => {
      tracker.beginExecution('exec-123');
      tracker.recordCreate('shared_data', 'producer-node', 'some value');
      tracker.recordRead('shared_data', 'consumer-node', 'producer-node');

      const consumedBy = tracker.getFieldConsumers('shared_data');
      expect(consumedBy.some((c) => c.nodeId === 'consumer-node')).toBe(true);
    });
  });

  describe('Update Operation', () => {
    test('should record field update', () => {
      tracker.beginExecution('exec-123');
      tracker.recordCreate('counter', 'node-1', 0);
      tracker.recordUpdate('counter', 'node-2', 0, 1);

      const producer = tracker.findProducerNodeId('counter');
      expect(producer).toBe('node-2'); // Latest producer
    });
  });

  describe('Transform Operation', () => {
    test('should record transform from single input', () => {
      tracker.beginExecution('exec-123');
      tracker.recordCreate('raw_text', 'node-1', 'long text content');
      tracker.recordTransform('processed_text', 'node-2', [{ key: 'raw_text', nodeId: 'node-1' }], 'trim');

      const producer = tracker.findProducerNodeId('processed_text');
      expect(producer).toBe('node-2');

      const lineageChain = tracker.getLineageChain('processed_text');
      expect(lineageChain.length).toBeGreaterThan(0);
    });

    test('should record transform from multiple inputs', () => {
      tracker.beginExecution('exec-123');
      tracker.recordCreate('first_name', 'node-1', 'John');
      tracker.recordCreate('last_name', 'node-1', 'Doe');
      tracker.recordTransform(
        'full_name',
        'node-2',
        [
          { key: 'first_name', nodeId: 'node-1' },
          { key: 'last_name', nodeId: 'node-1' },
        ],
        'concat'
      );

      const producer = tracker.findProducerNodeId('full_name');
      expect(producer).toBe('node-2');

      const consumedFields = tracker.getNodeConsumedFields('node-2');
      expect(consumedFields).toContain('first_name');
      expect(consumedFields).toContain('last_name');
    });
  });

  describe('Merge Operation', () => {
    test('should record merge operation', () => {
      tracker.beginExecution('exec-123');
      tracker.recordCreate('config_a', 'node-1', { setting1: true });
      tracker.recordCreate('config_b', 'node-1', { setting2: false });
      tracker.recordMerge(
        'merged_config',
        'node-2',
        [
          { key: 'config_a', nodeId: 'node-1' },
          { key: 'config_b', nodeId: 'node-1' },
        ]
      );

      const producedFields = tracker.getNodeProducedFields('node-2');
      expect(producedFields).toContain('merged_config');
    });
  });

  describe('Split Operation', () => {
    test('should record split operation', () => {
      tracker.beginExecution('exec-123');
      tracker.recordCreate('full_text', 'node-1', 'Part1\nPart2\nPart3');
      const splitNodes = tracker.recordSplit(
        [
          { key: 'part1', sourceKey: 'full_text' },
          { key: 'part2', sourceKey: 'full_text' },
          { key: 'part3', sourceKey: 'full_text' },
        ],
        'node-2',
        'split_by_newline'
      );

      expect(splitNodes).toHaveLength(3);

      // Verify all parts have correct lineage
      for (const part of ['part1', 'part2', 'part3']) {
        const producer = tracker.findProducerNodeId(part);
        expect(producer).toBe('node-2');
      }
    });
  });

  describe('Route Operation', () => {
    test('should record conditional route', () => {
      tracker.beginExecution('exec-123');
      tracker.recordCreate('status', 'node-1', 'pending');
      tracker.recordRoute('final_status', 'node-2', 'status == approved', 'approved');

      const producer = tracker.findProducerNodeId('final_status');
      expect(producer).toBe('node-2');
    });
  });

  describe('Field Lineage', () => {
    test('should get complete field lineage', () => {
      tracker.beginExecution('exec-123');

      // Create initial field
      tracker.recordCreate('raw_data', 'node-1', 'raw data');

      // Transform to processed data
      tracker.recordTransform('processed_data', 'node-2', [{ key: 'raw_data' }], 'process');

      // Transform to final output
      tracker.recordTransform('final_output', 'node-3', [{ key: 'processed_data' }], 'format');

      const lineage = tracker.getFieldLineage('final_output', 'formatted output');

      expect(lineage.lineageChain.length).toBeGreaterThanOrEqual(2);
      expect(lineage.producerNodeId).toBe('node-3');
    });

    test('should track consumers of a field', () => {
      tracker.beginExecution('exec-123');
      tracker.recordCreate('shared_title', 'node-1', 'Title');

      tracker.recordRead('shared_title', 'node-2', 'node-1');
      tracker.recordRead('shared_title', 'node-3', 'node-1');

      const consumers = tracker.getFieldConsumers('shared_title');
      expect(consumers.length).toBe(2);
      expect(consumers.some((c) => c.nodeId === 'node-2')).toBe(true);
      expect(consumers.some((c) => c.nodeId === 'node-3')).toBe(true);
    });
  });

  describe('Node Field Tracking', () => {
    test('should get fields produced by a node', () => {
      tracker.beginExecution('exec-123');
      tracker.recordCreate('field1', 'node-1', 'value1');
      tracker.recordCreate('field2', 'node-1', 'value2');

      const produced = tracker.getNodeProducedFields('node-1');
      expect(produced).toContain('field1');
      expect(produced).toContain('field2');
    });

    test('should get fields consumed by a node', () => {
      tracker.beginExecution('exec-123');
      tracker.recordCreate('input1', 'node-source', 'value1');
      tracker.recordCreate('input2', 'node-source', 'value2');
      tracker.recordTransform('output', 'node-consumer', [
        { key: 'input1', nodeId: 'node-source' },
        { key: 'input2', nodeId: 'node-source' },
      ], 'combine');

      const consumed = tracker.getNodeConsumedFields('node-consumer');
      expect(consumed).toContain('input1');
      expect(consumed).toContain('input2');
    });
  });

  describe('JSON Export', () => {
    test('should export lineage graph as JSON', () => {
      tracker.beginExecution('exec-123');
      tracker.recordCreate('field1', 'node-1', 'value1');
      tracker.recordTransform('field2', 'node-2', [{ key: 'field1' }], 'transform');

      const json = tracker.toJSON();

      expect(json.nodes).toBeInstanceOf(Array);
      expect(json.edges).toBeInstanceOf(Array);
      expect(json.nodes.length).toBeGreaterThan(0);
      expect(json.edges.length).toBeGreaterThan(0);
    });
  });

  describe('Global Instance', () => {
    test('should provide global instance', () => {
      const global1 = getGlobalLineageTracker();
      const global2 = getGlobalLineageTracker();
      expect(global1).toBe(global2);
    });

    test('should reset global instance', () => {
      resetGlobalLineageTracker();
      const fresh = getGlobalLineageTracker();
      expect(fresh).toBeDefined();
    });
  });
});
