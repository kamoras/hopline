/**
 * Builds catalog/agencies.json: every US agency with a keyless schedule feed (and its keyless real-time feeds), from the
 * Mobility Database's public catalog, minus the agencies Hopline already serves with hand-built providers.
 *
 *   npm run catalog                       # downloads the catalog
 *   npm run catalog -- --csv feeds.csv    # use a local copy
 *
 * The catalog says what exists; `scripts/ingest.ts` (next stage) downloads and validates each candidate before it is served.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCatalog, normalizeUrl, parseCsv, summarize } from "./lib/catalog.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = process.env.MOBILITY_DB_CSV ?? "https://files.mobilitydatabase.org/feeds_v2.csv";
const flag = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

/** Every schedule URL a hand-built agency already uses (in the build script), so the catalog does not add it again. */
function handBuiltUrls(): Set<string> {
  const text = readFileSync(join(ROOT, "scripts", "build-rail-gtfs.ts"), "utf8") + readFileSync(join(ROOT, "scripts", "build-mta-bus.ts"), "utf8");
  return new Set([...text.matchAll(/https?:\/\/[^"'`\s)]+/g)].map((m) => normalizeUrl(m[0])));
}

const csvPath = flag("--csv");
const text = csvPath ? readFileSync(csvPath, "utf8") : await (await fetch(SOURCE)).text();
const skip = new Set(Object.keys(JSON.parse(readFileSync(join(ROOT, "catalog", "skip.json"), "utf8")) as Record<string, string>));
const entries = buildCatalog(parseCsv(text), { handBuilt: handBuiltUrls(), skip });
writeFileSync(join(ROOT, "catalog", "agencies.json"), JSON.stringify({ source: SOURCE, generatedOn: new Date().toISOString().slice(0, 10), agencies: entries }, null, 1) + "\n");

const s = summarize(entries);
console.log(`${s.agencies} agencies in ${s.states} states, ${s.withLive} with a keyless live vehicle feed`);
console.log("Most: " + s.byState.slice(0, 10).map(([st, n]) => `${st} ${n}`).join(", "));
