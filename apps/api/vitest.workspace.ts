import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  {
    test: {
      name: 'unit',
      include: ['src/**/*.test.ts'],
      exclude: ['src/**/*.integration.test.ts'],
    },
  },
  {
    extends: './vitest.workers.config.ts',
    test: {
      name: 'integration',
      include: ['src/**/*.integration.test.ts'],
    },
  },
])
