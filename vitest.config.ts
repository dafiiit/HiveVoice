import { defineConfig } from "vitest/config";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], testTimeout: 30000, hookTimeout: 30000, fileParallelism: false },
});
