import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    /**
     * Dieselben Bedingungen wie in der CI — siehe `src/test-setup.ts`.
     *
     * Ohne diese Zeile prüft `npm run test:run` auf dem Entwicklungsrechner
     * etwas anderes als in der CI, sobald deren Node-Fassung eine andere ist.
     * Genau das ist am 23.08.2026 passiert.
     */
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/core/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts']
    }
  },
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, './src/core'),
      '@data': path.resolve(__dirname, './src/data'),
      '@ui': path.resolve(__dirname, './src/ui'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@lab': path.resolve(__dirname, './src/lab'),
    },
  },
});
