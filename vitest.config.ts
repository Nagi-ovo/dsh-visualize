import { defineConfig } from 'vitest/config'

/**
 * Type-only @deepseek-ai imports resolve through each linked package's
 * `exports` map (built lib/types); the specs exercise only this package's own
 * modules, so no host package is loaded at runtime. Node by default; a `.tsx`
 * spec that renders opts into jsdom with its own `@vitest-environment` pragma.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
  },
})
