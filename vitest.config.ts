import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'src/renderer/src/env.d.ts'
      ],
      thresholds: {
        lines: 50,
        statements: 47,
        functions: 39,
        branches: 34,
        'src/main/db/**': {
          lines: 90,
          statements: 85,
          functions: 85,
          branches: 65
        },
        'src/main/git/**': {
          lines: 90,
          statements: 80,
          functions: 80,
          branches: 65
        },
        'src/main/rpc/**': {
          lines: 97,
          statements: 97,
          functions: 95,
          branches: 88
        },
        'src/main/rpc/methods.ts': {
          lines: 100,
          statements: 100,
          functions: 100,
          branches: 95
        },
        'src/renderer/src/store/data.ts': {
          lines: 99,
          statements: 99,
          functions: 100,
          branches: 90
        },
        'src/main/terminal/terminal-manager.ts': {
          lines: 100,
          statements: 100,
          functions: 100,
          branches: 95
        }
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared')
    }
  }
})
