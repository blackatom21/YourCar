import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // `server-only` throws outside the React Server bundle; it's a no-op guard in tests.
    alias: { "server-only": new URL("./tests/helpers/empty.ts", import.meta.url).pathname },
  },
  test: {
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node" },
      },
      {
        extends: true,
        test: {
          name: "db",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          testTimeout: 30_000,
          hookTimeout: 60_000,
          // Integration tests share one local Supabase; run files serially.
          fileParallelism: false,
        },
      },
    ],
  },
});
