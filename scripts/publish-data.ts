/**
 * Packs every agency's generated schedule into one file each, ready for a static host:
 *
 *   npm run data:publish                       # writes dist-data/<agency>.json and dist-data/index.json
 *   HOPLINE_DATA_URL=https://.../hopline-data  # the server then fetches an agency's file the first time it needs it
 *
 * An agency is a folder of data/ (or ingested/) with stops, routes, trips, services and shapes (what `build-rail-gtfs.ts` writes); the
 * index lists each with its size and horizon so a stale or missing agency is visible. Nothing here is committed: the
 * weekly workflow publishes dist-data to GitHub Pages, so the repository does not have to carry every agency's files.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { missingKeys } from "./lib/ingest.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
/** The hand-built agencies (committed) and the ones the ingestion job generated (not committed). */
const SOURCES = [join(ROOT, "data"), join(ROOT, "ingested")];
const flagValue = (name: string) => process.argv[process.argv.indexOf(name) + 1];
const OUT = join(ROOT, process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "dist-data");
/** Where agencies already published live, for those this run did not rebuild (see `--keep-from`). */
const KEEP_FROM = process.argv.includes("--keep-from") ? flagValue("--keep-from")?.replace(/\/$/, "") : undefined;
const FILES = ["stops", "routes", "trips", "services", "shapes"] as const;

const read = (src: string, agency: string, name: string): unknown => JSON.parse(readFileSync(join(src, agency, `${name}.json`), "utf8"));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const index: { id: string; bytes: number; generatedOn?: string; horizon?: { from: string; to: string } }[] = [];
for (const [src, agency] of SOURCES.filter(existsSync).flatMap((src) => readdirSync(src).map((a) => [src, a] as const))) {
  if (!statSync(join(src, agency)).isDirectory() || !FILES.every((f) => existsSync(join(src, agency, `${f}.json`)))) continue;
  const bundle = Object.fromEntries(FILES.map((f) => [f, read(src, agency, f)]));
  const text = JSON.stringify(bundle);
  writeFileSync(join(OUT, `${agency}.json`), text);
  const meta = existsSync(join(src, agency, "meta.json")) ? (read(src, agency, "meta") as { generatedOn?: string; horizon?: { from: string; to: string } }) : {};
  index.push({ id: agency, bytes: text.length, generatedOn: meta.generatedOn, horizon: meta.horizon });
}
// A push that only changes bundled schedules does not rebuild the ingested ones; they are carried over from the live host
// (a Pages deploy replaces the whole site), so publishing one never drops the other.
if (KEEP_FROM) {
  const report = JSON.parse(readFileSync(join(ROOT, "catalog", "ingested.json"), "utf8")) as { served: { key: string }[] };
  const have = new Set(index.map((a) => a.id));
  let kept = 0;
  for (const key of missingKeys(report.served, have)) {
    try {
      const res = await fetch(`${KEEP_FROM}/${encodeURIComponent(key)}.json`, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`answered ${res.status}`);
      const text = await res.text();
      writeFileSync(join(OUT, `${key}.json`), text);
      index.push({ id: key, bytes: text.length });
      kept++;
    } catch (err) {
      console.warn(`Could not carry over ${key}: ${err instanceof Error ? err.message : err}`);
    }
  }
  // The station search index is rebuilt with the ingested agencies; until then the live one stays.
  try {
    const res = await fetch(`${KEEP_FROM}/places.json`, { signal: AbortSignal.timeout(60_000) });
    if (res.ok) writeFileSync(join(OUT, "places.json"), await res.text());
  } catch {
    console.warn("Could not carry over places.json");
  }
  console.log(`Carried over ${kept} ingested agencies from ${KEEP_FROM}`);
}
writeFileSync(join(OUT, "index.json"), JSON.stringify({ generatedAt: new Date().toISOString(), agencies: index }, null, 1));
const total = index.reduce((n, a) => n + a.bytes, 0);
console.log(`Packed ${index.length} agencies (${(total / 1048576).toFixed(1)} MB) into ${OUT}`);
