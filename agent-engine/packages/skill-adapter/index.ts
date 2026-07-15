/**
 * @enterprise-claw/skill-adapter
 * Skill Platform - MCP Client + Skill Adapter for EnterpriseClaw Phase 1
 *
 * Package responsibilities (主线 D):
 *  - MCP Client wrapper with retry, circuit-breaker, and enterprise auth
 *  - OpenClaw Skill → MCP schema converter
 *  - OpenClaw Skill Adapter (Tier3 community skills thin wrapper)
 *  - Enterprise MCP Adapter (Tier1/Tier2 with whitelist/blacklist)
 *  - Unified Skill Adapter Facade
 *
 * Architecture: See ADR-003-MCP-Primary-Protocol.md
 */

// Types
export * from './types';

// Schema conversion
export * from './schema-converter';

// Adapters
export * from './openclaw-skill-adapter';
export * from './enterprise-adapter';
export * from './skill-adapter-facade';
