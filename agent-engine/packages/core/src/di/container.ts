/**
 * IOC Container — P1-T08
 * Lightweight dependency injection container with singleton / transient support.
 *
 * Features:
 * - Singleton lifetime: one instance per token, created on first resolve
 * - Transient lifetime: new instance every resolve
 * - Factory registration: custom factory function
 * - Child containers: isolated sub-containers for unit testing (Mock overrides)
 * - Built-in MockBuilder for test double creation
 */

import type {
  IRoleModel,
  IExecutionTraceModel,
  IPerformanceMetricModel,
  IChatMessageService,
  ILLMProviderFactory,
  IDifyClient,
  IDifyGateway,
  IWorkflowEngine,
  AgentDependencies,
} from '../interfaces/index.js';

export { ROLE_MODEL_TOKEN } from './tokens.js';
export { EXECUTION_TRACE_MODEL_TOKEN } from './tokens.js';
export { PERFORMANCE_METRIC_MODEL_TOKEN } from './tokens.js';
export { CHAT_MESSAGE_SERVICE_TOKEN } from './tokens.js';
export { LLM_PROVIDER_FACTORY_TOKEN } from './tokens.js';
export { DIFY_CLIENT_TOKEN } from './tokens.js';
export { DIFY_GATEWAY_TOKEN } from './tokens.js';
export { WORKFLOW_ENGINE_TOKEN } from './tokens.js';
export { AGENT_DEPENDENCIES_TOKEN } from './tokens.js';

// ─── Lifetime ─────────────────────────────────────────────────────────────────

export type Lifetime = 'singleton' | 'transient';

// ─── Registry Entry ───────────────────────────────────────────────────────────

interface RegistryEntry<T> {
  factory: () => T;
  lifetime: Lifetime;
  instance?: T; // cached singleton instance
}

// ─── Container ────────────────────────────────────────────────────────────────

export class Container {
  private readonly registry = new Map<symbol, RegistryEntry<unknown>>();
  private readonly parent?: Container;

  constructor(parent?: Container) {
    this.parent = parent;
  }

  // ─── Registration ───────────────────────────────────────────────────────────

  /**
   * Register a service with an explicit factory function.
   */
  register<T>(token: symbol, factory: () => T, lifetime: Lifetime = 'singleton'): void {
    this.registry.set(token, { factory, lifetime });
  }

  /**
   * Register a singleton instance directly (convenience, no factory needed).
   */
  registerSingleton<T>(token: symbol, instance: T): void {
    this.registry.set(token, {
      factory: () => instance,
      lifetime: 'singleton',
      instance,
    });
  }

  /**
   * Register a class constructor with a lifetime.
   */
  registerClass<T>(
    token: symbol,
    ctor: new (...args: unknown[]) => T,
    lifetime: Lifetime = 'singleton'
  ): void {
    this.registry.set(token, { factory: () => new ctor(), lifetime });
  }

  /**
   * Check if a token is registered (checks this container + parent chain).
   */
  isRegistered(token: symbol): boolean {
    if (this.registry.has(token)) return true;
    return this.parent?.isRegistered(token) ?? false;
  }

  // ─── Resolution ─────────────────────────────────────────────────────────────

  /**
   * Resolve a token to an instance.
   * Throws if not registered.
   */
  resolve<T>(token: symbol): T {
    const entry = this.findEntry(token);
    if (!entry) {
      throw new Error(`[Container] Token ${String(token)} is not registered`);
    }

    if (entry.lifetime === 'singleton') {
      if (entry.instance === undefined) {
        entry.instance = entry.factory();
      }
      return entry.instance as T;
    }

    // transient: create fresh every time
    return entry.factory() as T;
  }

  /**
   * Try to resolve; returns undefined if not registered instead of throwing.
   */
  resolveOptional<T>(token: symbol): T | undefined {
    try {
      return this.resolve<T>(token);
    } catch {
      return undefined;
    }
  }

  // ─── Child Containers ───────────────────────────────────────────────────────

  /**
   * Create an isolated child container.
   * Child can override parent registrations.
   * Used for unit tests to provide Mock implementations.
   */
  createChild(): Container {
    return new Container(this);
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private findEntry(token: symbol): RegistryEntry<unknown> | undefined {
    const local = this.registry.get(token);
    if (local) return local;
    return this.parent?.findEntry(token);
  }

  // ─── AgentDependencies Aggregation ──────────────────────────────────────────

  /**
   * Resolve all agent dependencies from registered tokens.
   * Convenience method for wiring up AgentOrchestrator.
   *
   * Throws if required tokens are missing (optional ones are skipped).
   */
  resolveAgentDependencies(): AgentDependencies {
    return {
      roleModel: this.resolve(ROLE_MODEL_TOKEN),
      executionTraceModel: this.resolve(EXECUTION_TRACE_MODEL_TOKEN),
      performanceMetricModel: this.resolve(PERFORMANCE_METRIC_MODEL_TOKEN),
      chatMessageService: this.resolve(CHAT_MESSAGE_SERVICE_TOKEN),
      llmProviderFactory: this.resolve(LLM_PROVIDER_FACTORY_TOKEN),
      difyClient: this.resolveOptional(DIFY_CLIENT_TOKEN),
      difyGateway: this.resolveOptional(DIFY_GATEWAY_TOKEN),
      workflowEngine: this.resolveOptional(WORKFLOW_ENGINE_TOKEN),
    };
  }
}

// ─── Global Container Singleton ───────────────────────────────────────────────

let _rootContainer: Container | undefined;

export function getRootContainer(): Container {
  if (!_rootContainer) {
    _rootContainer = new Container();
  }
  return _rootContainer;
}

export function setRootContainer(container: Container): void {
  _rootContainer = container;
}

export function resetRootContainer(): void {
  _rootContainer = undefined;
}

// ─── Mock Helpers ─────────────────────────────────────────────────────────────

/**
 * Create a mock implementation of an interface.
 * Returns a Proxy that intercepts property access.
 */
export function mockOf<T extends object>(overrides: Partial<T> = {}): T {
  return new Proxy({} as T, {
    get(_target, prop, receiver) {
      if (prop in overrides) {
        const val = (overrides as Record<string, unknown>)[String(prop)];
        return typeof val === 'function' ? val.bind(overrides) : val;
      }
      // Return a no-op function for method-like properties
      if (String(prop).startsWith('_') || String(prop) === 'then') {
        return receiver;
      }
      return (() => {}) as unknown;
    },
  });
}

// ─── Token Imports ────────────────────────────────────────────────────────────

import {
  ROLE_MODEL_TOKEN,
  EXECUTION_TRACE_MODEL_TOKEN,
  PERFORMANCE_METRIC_MODEL_TOKEN,
  CHAT_MESSAGE_SERVICE_TOKEN,
  LLM_PROVIDER_FACTORY_TOKEN,
  DIFY_CLIENT_TOKEN,
  DIFY_GATEWAY_TOKEN,
  WORKFLOW_ENGINE_TOKEN,
} from './tokens.js';
