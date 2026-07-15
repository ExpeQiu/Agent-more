/**
 * ConditionEvaluator 单元测试
 */

import { describe, it, expect } from 'vitest';
import { ConditionEvaluator } from '../condition-evaluator';

const ctx = {
  input: { score: 0.6, status: 'ok', count: 5, flag: false, name: 'test', nested: { value: 42 } },
  globalState: { retries: 3, limit: 10 },
};

const evaluator = new ConditionEvaluator();

describe('ConditionEvaluator', () => {
  // ============================================================
  // 简单比较（向后兼容）
  // ============================================================
  describe('简单比较（向后兼容）', () => {
    it('score < 0.7', () => {
      expect(evaluator.evaluate('score < 0.7', ctx)).toBe(true);
    });

    it('score > 0.7', () => {
      expect(evaluator.evaluate('score > 0.7', ctx)).toBe(false);
    });

    it('status == "ok"', () => {
      expect(evaluator.evaluate('status == "ok"', ctx)).toBe(true);
    });

    it('status != "ok"', () => {
      expect(evaluator.evaluate('status != "ok"', ctx)).toBe(false);
    });

    it('count >= 5', () => {
      expect(evaluator.evaluate('count >= 5', ctx)).toBe(true);
    });

    it('count <= 4', () => {
      expect(evaluator.evaluate('count <= 4', ctx)).toBe(false);
    });

    it('嵌套属性 nested.value', () => {
      expect(evaluator.evaluate('nested.value > 40', ctx)).toBe(true);
    });

    it('input.score 命名空间', () => {
      expect(evaluator.evaluate('input.score < 0.7', ctx)).toBe(true);
    });

    it('globalState.retries', () => {
      expect(evaluator.evaluate('globalState.retries > 2', ctx)).toBe(true);
    });
  });

  // ============================================================
  // 复杂逻辑表达式
  // ============================================================
  describe('复杂逻辑表达式', () => {
    it('a > 5 && b == "test"（两个条件）', () => {
      const c = {
        input: { a: 6, b: 'test' },
        globalState: {},
      };
      expect(evaluator.evaluate('a > 5 && b == "test"', c)).toBe(true);
      expect(evaluator.evaluate('a > 5 && b == "wrong"', c)).toBe(false);
    });

    it('score > 0.5 && count > 3', () => {
      expect(evaluator.evaluate('score > 0.5 && count > 3', ctx)).toBe(true);
    });

    it('score > 0.5 && count > 10', () => {
      expect(evaluator.evaluate('score > 0.5 && count > 10', ctx)).toBe(false);
    });

    it('score > 0.9 || count > 3', () => {
      expect(evaluator.evaluate('score > 0.9 || count > 3', ctx)).toBe(true);
    });

    it('score > 0.9 || count > 10（两侧均假）', () => {
      expect(evaluator.evaluate('score > 0.9 || count > 10', ctx)).toBe(false);
    });

    it('!flag', () => {
      expect(evaluator.evaluate('!flag', ctx)).toBe(true);
      const c2 = { input: { flag: true }, globalState: {} };
      expect(evaluator.evaluate('!flag', c2)).toBe(false);
    });

    it('!(count > 3)', () => {
      expect(evaluator.evaluate('!(count > 3)', ctx)).toBe(false);
    });

    it('混合: score > 0.5 && (count > 10 || flag == false)', () => {
      expect(evaluator.evaluate('score > 0.5 && (count > 10 || flag == false)', ctx)).toBe(true);
    });
  });

  // ============================================================
  // 非法表达式
  // ============================================================
  describe('非法表达式', () => {
    it('非法表达式抛出明确错误', () => {
      expect(() => evaluator.evaluate('a >>> 5', ctx)).toThrow();
    });
  });
});
