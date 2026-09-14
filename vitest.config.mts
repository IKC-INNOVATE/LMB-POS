import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    // .test.ts (logique métier, lib/services/*) tourne en environnement 'node'
    // (rapide, pas de DOM). .test.tsx (composants) déclare son propre
    // environnement jsdom via le pragma `// @vitest-environment jsdom` en
    // tête de fichier, pour ne pas ralentir/modifier les tests existants.
    include: ['__tests__/**/*.test.ts', '__tests__/**/*.test.tsx'],
    setupFiles: ['./__tests__/testUtils/setupComponentTests.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
    },
  },
});
