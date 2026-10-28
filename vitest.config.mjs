import { defineConfig } from 'vitest/config';

// Times in tests are written in UTC; "browser" time zone must not depend on the machine.
process.env.TZ = 'UTC';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});
