import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
export default defineConfig({
  resolve: {
    alias: {
      '@openmaintainer/shared': resolve(__dirname, 'packages/shared/src/index.ts'),
      '@openmaintainer/config': resolve(__dirname, 'packages/config/src/index.ts'),
      '@openmaintainer/prompts': resolve(__dirname, 'packages/prompts/src/index.ts'),
      '@openmaintainer/ai': resolve(__dirname, 'packages/ai/src/index.ts'),
      '@openmaintainer/core': resolve(__dirname, 'packages/core/src/index.ts'),
      '@openmaintainer/github': resolve(__dirname, 'packages/github/src/index.ts'),
      '@openmaintainer/logger': resolve(__dirname, 'packages/logger/src/index.ts'),
    },
  },
  test: {
    include: ['packages/**/tests/**/*.test.ts', 'apps/**/tests/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts'],
      exclude: ['**/index.ts'],
    },
  },
});
