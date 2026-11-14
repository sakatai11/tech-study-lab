import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
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
    ],
  },
})
