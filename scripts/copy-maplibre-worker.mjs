/**
 * MapLibre GL v6 locates its web worker next to its own module via
 * `import.meta.url`. Bundlers relocate that module, so the worker would 404.
 * We serve the worker from /public ourselves and point MapLibre at it
 * (see `setWorkerUrl` in src/components/train-map.tsx). Runs before dev/build.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dest = join(root, "public", "maplibre");
mkdirSync(dest, { recursive: true });
copyFileSync(
  join(root, "node_modules", "maplibre-gl", "dist", "maplibre-gl-worker.mjs"),
  join(dest, "maplibre-gl-worker.mjs"),
);
