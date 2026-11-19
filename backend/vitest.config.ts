import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          // Boots an isolated Next.js server against the <db>_test database (see global-setup.ts).
          globalSetup: ["tests/integration/global-setup.ts"],
          testTimeout: 120_000,
          hookTimeout: 300_000,
          // Files share one server + database; one worker runs them one at a time for deterministic state.
          maxWorkers: 1,
        },
      },
    ],
  },
});
