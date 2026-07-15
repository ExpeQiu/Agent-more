import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: [
        'packages/core/src/**/*.ts',
        'packages/scene-router/src/**/*.ts',
        'packages/llm-adapters/src/**/*.ts',
        'apps/server/src/**/*.ts',
      ],
      exclude: [
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/node_modules/**',
        '**/dist/**',
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60,
      },
    },
    include: [
      'packages/**/__tests__/**/*.test.ts',
      'tests/**/*.test.ts',
      'tests/**/*.spec.ts',
    ],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@agent-engine/core': resolve(__dirname, 'packages/core/src'),
      '@agent-engine/llm-adapters': resolve(__dirname, 'packages/llm-adapters/src'),
      '@agent-engine/scene-router': resolve(__dirname, 'packages/scene-router/src'),
    },
  },
});
