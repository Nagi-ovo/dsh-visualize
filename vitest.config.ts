import { defineConfig } from 'vitest/config'

/**
 * Type-only @deepseek-ai imports resolve through each linked package's
 * `exports` map (built lib/types); the specs exercise only this package's
 * pure modules (fragment validation and shell assembly), so no snapshot
 * package is loaded at runtime.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
  },
})
