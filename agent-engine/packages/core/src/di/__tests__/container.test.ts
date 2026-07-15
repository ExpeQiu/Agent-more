/**
 * Container Unit Tests — P1-T08
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  Container,
  getRootContainer,
  resetRootContainer,
  ROLE_MODEL_TOKEN,
  CHAT_MESSAGE_SERVICE_TOKEN,
  LLM_PROVIDER_FACTORY_TOKEN,
} from '../index.js';

// ─── Test Doubles ─────────────────────────────────────────────────────────────

interface TestRoleModel {
  getById(id: string): Promise<{ id: string; name: string } | null>;
}

const mockRoleModel: TestRoleModel = {
  async getById(id) {
    return { id, name: `Role-${id}` };
  },
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Container', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  describe('registerSingleton', () => {
    it('returns the same instance on every resolve', () => {
      container.registerSingleton(ROLE_MODEL_TOKEN, mockRoleModel);

      const inst1 = container.resolve<TestRoleModel>(ROLE_MODEL_TOKEN);
      const inst2 = container.resolve<TestRoleModel>(ROLE_MODEL_TOKEN);

      expect(inst1).toBe(inst2);
      expect(inst1).toBe(mockRoleModel);
    });
  });

  describe('register (transient)', () => {
    it('returns a new instance on every resolve', () => {
      container.register(
        CHAT_MESSAGE_SERVICE_TOKEN,
        () => ({ getConversationMessages: async () => [] }),
        'transient'
      );

      const inst1 = container.resolve(CHAT_MESSAGE_SERVICE_TOKEN);
      const inst2 = container.resolve(CHAT_MESSAGE_SERVICE_TOKEN);

      expect(inst1).not.toBe(inst2);
    });
  });

  describe('register (singleton factory)', () => {
    it('calls factory only once', () => {
      let callCount = 0;
      container.register(
        LLM_PROVIDER_FACTORY_TOKEN,
        () => {
          callCount++;
          return { create: () => ({}) };
        },
        'singleton'
      );

      container.resolve(LLM_PROVIDER_FACTORY_TOKEN);
      container.resolve(LLM_PROVIDER_FACTORY_TOKEN);

      expect(callCount).toBe(1);
    });
  });

  describe('createChild', () => {
    it('child can override parent registration', () => {
      container.registerSingleton(ROLE_MODEL_TOKEN, mockRoleModel);

      const child = container.createChild();
      const childModel = { getById: async () => ({ id: 'child', name: 'ChildRole' }) };
      child.registerSingleton(ROLE_MODEL_TOKEN, childModel);

      expect(child.resolve<TestRoleModel>(ROLE_MODEL_TOKEN)).toBe(childModel);
      // parent still returns original
      expect(container.resolve<TestRoleModel>(ROLE_MODEL_TOKEN)).toBe(mockRoleModel);
    });

    it('child falls back to parent if token not overridden', () => {
      container.registerSingleton(ROLE_MODEL_TOKEN, mockRoleModel);

      const child = container.createChild();
      // child does NOT override ROLE_MODEL_TOKEN

      expect(child.resolve<TestRoleModel>(ROLE_MODEL_TOKEN)).toBe(mockRoleModel);
    });
  });

  describe('resolveOptional', () => {
    it('returns undefined for unregistered token', () => {
      const result = container.resolveOptional(ROLE_MODEL_TOKEN);
      expect(result).toBeUndefined();
    });

    it('returns instance for registered token', () => {
      container.registerSingleton(ROLE_MODEL_TOKEN, mockRoleModel);
      const result = container.resolveOptional<TestRoleModel>(ROLE_MODEL_TOKEN);
      expect(result).toBe(mockRoleModel);
    });
  });

  describe('isRegistered', () => {
    it('returns false for unregistered token', () => {
      expect(container.isRegistered(ROLE_MODEL_TOKEN)).toBe(false);
    });

    it('returns true for registered token', () => {
      container.registerSingleton(ROLE_MODEL_TOKEN, mockRoleModel);
      expect(container.isRegistered(ROLE_MODEL_TOKEN)).toBe(true);
    });

    it('child reports parent registrations as registered', () => {
      container.registerSingleton(ROLE_MODEL_TOKEN, mockRoleModel);
      const child = container.createChild();
      expect(child.isRegistered(ROLE_MODEL_TOKEN)).toBe(true);
    });
  });

  describe('resolve', () => {
    it('throws for unregistered token', () => {
      expect(() => container.resolve(ROLE_MODEL_TOKEN)).toThrow(
        /not registered/
      );
    });
  });
});

describe('Global Container', () => {
  beforeEach(() => {
    resetRootContainer();
  });

  it('getRootContainer returns a singleton', () => {
    const c1 = getRootContainer();
    const c2 = getRootContainer();
    expect(c1).toBe(c2);
  });

  it('resetRootContainer clears the singleton', () => {
    const c1 = getRootContainer();
    resetRootContainer();
    const c2 = getRootContainer();
    expect(c1).not.toBe(c2);
  });
});
