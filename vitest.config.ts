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
        lines: 60,
        statements: 55,
        functions: 50,
        branches: 45,
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
        },
        'src/main/terminal/terminal-host.ts': {
          lines: 95,
          statements: 95,
          functions: 95,
          branches: 90
        },
        'src/main/terminal/terminal-host-client.ts': {
          lines: 80,
          statements: 74,
          functions: 74,
          branches: 55
        },
        'src/main/agents/opencode-session-locator.ts': {
          lines: 85,
          statements: 82,
          functions: 85,
          branches: 50
        },
        'src/renderer/src/store/nav.ts': {
          lines: 85,
          statements: 85,
          functions: 80,
          branches: 75
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
