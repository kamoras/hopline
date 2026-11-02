/**
 * Packs every agency's generated schedule into one file each, ready for a static host:
 *
 *   npm run data:publish                       # writes dist-data/<agency>.json and dist-data/index.json
 *   HOPLINE_DATA_URL=https://.../hopline-data  # the server then fetches an agency's file the first time it needs it
 *
 * An agency is a folder of data/ with stops, routes, trips, services and shapes (what `build-rail-gtfs.ts` writes); the
 * index lists each with its size and horizon so a stale or missing agency is visible. Nothing here is committed: the
 * weekly workflow publishes dist-data to GitHub Pages, so the repository does not have to carry every agency's files.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "data");
const OUT = join(ROOT, process.argv[2] ?? "dist-data");
const FILES = ["stops", "routes", "trips", "services", "shapes"] as const;

const read = (agency: string, name: string): unknown => JSON.parse(readFileSync(join(SRC, agency, `${name}.json`), "utf8"));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const index: { id: string; bytes: number; generatedOn?: string; horizon?: { from: string; to: string } }[] = [];
for (const agency of readdirSync(SRC)) {
  if (!statSync(join(SRC, agency)).isDirectory() || !FILES.every((f) => existsSync(join(SRC, agency, `${f}.json`)))) continue;
  const bundle = Object.fromEntries(FILES.map((f) => [f, read(agency, f)]));
  const text = JSON.stringify(bundle);
  writeFileSync(join(OUT, `${agency}.json`), text);
  const meta = existsSync(join(SRC, agency, "meta.json")) ? (read(agency, "meta") as { generatedOn?: string; horizon?: { from: string; to: string } }) : {};
  index.push({ id: agency, bytes: text.length, generatedOn: meta.generatedOn, horizon: meta.horizon });
}
writeFileSync(join(OUT, "index.json"), JSON.stringify({ generatedAt: new Date().toISOString(), agencies: index }, null, 1));
const total = index.reduce((n, a) => n + a.bytes, 0);
console.log(`Packed ${index.length} agencies (${(total / 1048576).toFixed(1)} MB) into ${OUT}`);
