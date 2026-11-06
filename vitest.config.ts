import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Pure logic runs in Node. A test that needs a DOM says so on its first line
// with `// @vitest-environment jsdom`.
export default defineConfig({
  oxc: {
    jsx: {
      runtime: 'automatic',
      importSource: 'react',
    },
  },
  resolve: {
    alias: {
      'server-only': fileURLToPath(new URL('./test/server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.ts'],
  },
});
