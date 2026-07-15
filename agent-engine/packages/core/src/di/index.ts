/**
 * DI Module — P1-T08
 * IOC / Dependency Injection container + all DI tokens.
 *
 * Usage:
 * ```ts
 * import { Container, getRootContainer, ROLE_MODEL_TOKEN } from '@agent-engine/core';
 *
 * const container = getRootContainer();
 * container.registerSingleton(ROLE_MODEL_TOKEN, new PrismaRoleModel());
 *
 * const roleModel = container.resolve(ROLE_MODEL_TOKEN);
 * ```
 */

export { Container } from './container.js';
export { getRootContainer, setRootContainer, resetRootContainer } from './container.js';
export { mockOf } from './container.js';

export {
  ROLE_MODEL_TOKEN,
  EXECUTION_TRACE_MODEL_TOKEN,
  PERFORMANCE_METRIC_MODEL_TOKEN,
  CHAT_MESSAGE_SERVICE_TOKEN,
  LLM_PROVIDER_FACTORY_TOKEN,
  DIFY_CLIENT_TOKEN,
  DIFY_GATEWAY_TOKEN,
  WORKFLOW_ENGINE_TOKEN,
  AGENT_DEPENDENCIES_TOKEN,
} from './tokens.js';
