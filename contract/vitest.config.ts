import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/setup.ts'],
    // Files run side by side, so their waits for the 60-second gap between codes overlap.
    testTimeout: 15_000,
  },
});
