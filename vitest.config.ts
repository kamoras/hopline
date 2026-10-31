import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    // Some tests load a network's bundled data (megabytes of JSON, lazily) for the first time; on a busy machine that can pass 5 s.
    testTimeout: 30_000,
  },
});
