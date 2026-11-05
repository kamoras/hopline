/**
 * Downloads and validates every candidate agency of catalog/agencies.json, builds the ones that pass into ingested/<key>/
 * (published with the rest of the schedule data), and writes catalog/ingested.json: what will be served and why the rest
 * will not. Nothing is served that this has not seen work.
 *
 *   npm run ingest                         # every candidate (slow: run in CI, in batches)
 *   npm run ingest -- --only id1 id2       # just these
 *   npm run ingest -- --live-only --limit 20
 *   npm run ingest -- --batch 3/10 --part part-3.json   # the third of ten slices (parallel jobs); `npm run ingest:merge` joins them
 *
 * A candidate is rejected, with a reason, when its download fails or is too large, it is not a usable schedule, it is out
 * of service, its live feed does not match it (and it is a bus network), or the build yields nothing.
 */
import AdmZip from "adm-zip";
import gtfs from "gtfs-realtime-bindings";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, type CatalogEntry } from "./lib/catalog.js";
import { checkLive, inService, keyFor, modesIn, planFor, type IngestMode, type LiveCheck } from "./lib/ingest.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "ingested");
const WORK = join(ROOT, ".ingest-work");
const MAX_ZIP_BYTES = 80 * 1024 * 1024;
const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");

interface Served {
  id: string;
  key: string;
  name: string;
  state: string;
  mode: IngestMode;
  kind: "live" | "timetable";
  bbox: CatalogEntry["bbox"];
  stops: number;
  routes: number;
  bytes: number;
  feeds?: CatalogEntry["rt"];
  live?: LiveCheck;
}
interface Rejected {
  id: string;
  name: string;
  reason: string;
}

const flag = (name: string) => process.argv.indexOf(name);
const many = (name: string) => {
  const i = flag(name);
  if (i < 0) return [];
  const out: string[] = [];
  for (let j = i + 1; j < process.argv.length && !process.argv[j]!.startsWith("--"); j++) out.push(process.argv[j]!);
  return out;
};

const describe = (err: unknown) => {
  const e = err as { message?: string; cause?: { code?: string; message?: string } };
  return e?.cause?.code ?? e?.cause?.message ?? e?.message ?? String(err);
};

async function download(url: string, file: string): Promise<void> {
  const get = (u: string) => fetch(u, { signal: AbortSignal.timeout(120_000), headers: { "user-agent": "Hopline-ingest (+https://github.com/kamoras/hopline)" } });
  let res: Response;
  try {
    res = await get(url);
  } catch (err) {
    // Many schedule addresses are plain http; try the secure one before giving up.
    if (!url.startsWith("http://")) throw new Error(`could not download (${describe(err)})`);
    try {
      res = await get(url.replace("http://", "https://"));
    } catch {
      throw new Error(`could not download (${describe(err)})`);
    }
  }
  if (!res.ok) throw new Error(`download answered ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_ZIP_BYTES) throw new Error(`feed is ${(buf.length / 1048576).toFixed(0)} MB, over the ${MAX_ZIP_BYTES / 1048576} MB limit`);
  writeFileSync(file, buf);
}

const rows = (zip: AdmZip, name: string) => {
  const e = zip.getEntry(name);
  return e ? parseCsv(e.getData().toString("utf8").replace(/^﻿/, "")) : [];
};

async function liveSample(entry: CatalogEntry, routeIds: Set<string>, tripIds: Set<string>): Promise<LiveCheck | undefined> {
  const url = entry.rt?.vehicles;
  if (!url) return undefined;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { "user-agent": "Hopline-ingest (+https://github.com/kamoras/hopline)" } });
    if (!res.ok) return undefined;
    const feed = gtfs.transit_realtime.FeedMessage.decode(new Uint8Array(await res.arrayBuffer()));
    const vehicles = feed.entity.flatMap((e) => (e.vehicle?.position ? [{ routeId: e.vehicle.trip?.routeId, tripId: e.vehicle.trip?.tripId }] : []));
    return checkLive(vehicles, routeIds, tripIds);
  } catch {
    return undefined;
  }
}

async function ingest(entry: CatalogEntry): Promise<{ served: Served[]; rejected?: Rejected }> {
  const reject = (reason: string) => ({ served: [], rejected: { id: entry.id, name: entry.name, reason } });
  const file = join(WORK, `${entry.id}.zip`);
  try {
    await download(entry.staticUrl, file);
    let zip: AdmZip;
    try {
      zip = new AdmZip(file);
    } catch {
      return reject("download is not a zip file");
    }
    for (const need of ["stops.txt", "routes.txt", "trips.txt", "stop_times.txt"]) if (!zip.getEntry(need)) return reject(`schedule has no ${need}`);
    const routes = rows(zip, "routes.txt");
    if (!inService(rows(zip, "calendar.txt"), rows(zip, "calendar_dates.txt"), today)) return reject("schedule is out of service (ends before today)");
    const modes = modesIn(routes);
    if (modes.size === 0) return reject("no bus, metro, rail or ferry routes");

    const live = await liveSample(entry, new Set(routes.map((r) => r.route_id!)), new Set(rows(zip, "trips.txt").map((t) => t.trip_id!)));
    const served: Served[] = [];
    const notes: string[] = [];
    for (const [mode, types] of modes) {
      const plan = planFor(mode, types, live);
      if (!plan) {
        notes.push(`${mode}: no live feed that matches the schedule${live ? ` (${live.matched} of ${live.vehicles} vehicles matched)` : entry.rt?.vehicles ? " (live feed unreachable)" : ""}`);
        continue;
      }
      const key = keyFor(entry.id, mode, modes.size);
      const dir = join(OUT, key);
      rmSync(dir, { recursive: true, force: true });
      const run = spawnSync("npx", ["tsx", "scripts/build-rail-gtfs.ts", key, "--zip", file, "--out", dir, "--options", JSON.stringify(plan.options)], { cwd: ROOT, encoding: "utf8", timeout: 240_000 });
      if (run.status !== 0) {
        notes.push(`${mode}: build failed (${(run.stderr || run.error?.message || "").split("\n").filter((l) => l.trim() && !l.includes("Warning") && !l.includes("trace-warnings")).pop() ?? "unknown"})`);
        continue;
      }
      const read = (n: string) => JSON.parse(readFileSync(join(dir, `${n}.json`), "utf8")) as unknown;
      const stops = Object.keys(read("stops") as object).length;
      const routeCount = Object.keys(read("routes") as object).length;
      const meta = read("meta") as { tripCount: number };
      if (stops === 0 || routeCount === 0 || (plan.kind === "timetable" && meta.tripCount === 0)) {
        rmSync(dir, { recursive: true, force: true });
        notes.push(`${mode}: the build had no ${stops === 0 ? "stops" : routeCount === 0 ? "routes" : "trips in the next two months"}`);
        continue;
      }
      const bytes = ["stops", "routes", "trips", "services", "shapes"].reduce((n, f) => n + statSync(join(dir, `${f}.json`)).size, 0);
      served.push({ id: entry.id, key, name: entry.name, state: entry.state, mode, kind: plan.kind, bbox: entry.bbox, stops, routes: routeCount, bytes, ...(entry.rt ? { feeds: entry.rt } : {}), ...(live ? { live } : {}) });
    }
    return served.length ? { served } : reject(notes.join("; ") || "nothing to serve");
  } catch (err) {
    return reject(err instanceof Error ? err.message : String(err));
  } finally {
    rmSync(file, { force: true });
  }
}

const catalog = (JSON.parse(readFileSync(join(ROOT, "catalog", "agencies.json"), "utf8")) as { agencies: CatalogEntry[] }).agencies;
let todo = catalog;
const only = many("--only");
if (only.length) todo = todo.filter((e) => only.includes(e.id));
if (flag("--live-only") >= 0) todo = todo.filter((e) => e.rt?.vehicles);
const batch = process.argv[flag("--batch") + 1]?.match(/^(\d+)\/(\d+)$/);
if (flag("--batch") >= 0 && batch) todo = todo.filter((_, i) => i % Number(batch[2]) === Number(batch[1]) - 1);
const limit = Number(process.argv[flag("--limit") + 1]);
if (flag("--limit") >= 0 && limit > 0) todo = todo.slice(0, limit);

mkdirSync(WORK, { recursive: true });
mkdirSync(OUT, { recursive: true });
const served: Served[] = [];
const rejected: Rejected[] = [];
const CONCURRENCY = Number(process.argv[flag("--concurrency") + 1]) || 3;
let next = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let i = next++; i < todo.length; i = next++) {
      const t0 = Date.now();
      const r = await ingest(todo[i]!);
      served.push(...r.served);
      if (r.rejected) rejected.push(r.rejected);
      console.log(`[${i + 1}/${todo.length}] ${todo[i]!.id.slice(0, 44).padEnd(44)} ${r.served.length ? r.served.map((s) => `${s.mode}:${s.kind}`).join(" ") : "rejected: " + r.rejected!.reason.slice(0, 80)} (${Math.round((Date.now() - t0) / 1000)}s)`);
    }
  }),
);

const partFile = process.argv[flag("--part") + 1];
if (flag("--part") >= 0 && partFile) {
  // A parallel batch: write just this slice's result; `npm run ingest:merge` joins the slices into the report.
  writeFileSync(partFile, JSON.stringify({ served, rejected }) + "\n");
  rmSync(WORK, { recursive: true, force: true });
  console.log(`\n${served.length} served, ${rejected.length} rejected (written to ${partFile})`);
  process.exit(0);
}
const reportFile = join(ROOT, "catalog", "ingested.json");
// A partial run (--only, --limit, --batch) updates the report instead of replacing it.
const prior = existsSync(reportFile) ? (JSON.parse(readFileSync(reportFile, "utf8")) as { served: Served[]; rejected: Rejected[] }) : { served: [], rejected: [] };
const ids = new Set(todo.map((e) => e.id));
const inCatalog = new Set(catalog.map((e) => e.id));
const merged = {
  checkedOn: new Date().toISOString().slice(0, 10),
  served: [...prior.served.filter((s) => !ids.has(s.id) && inCatalog.has(s.id)), ...served].sort((a, b) => a.key.localeCompare(b.key)),
  rejected: [...prior.rejected.filter((r) => !ids.has(r.id) && inCatalog.has(r.id)), ...rejected].sort((a, b) => a.id.localeCompare(b.id)),
};
writeFileSync(reportFile, JSON.stringify(merged, null, 1) + "\n");
rmSync(WORK, { recursive: true, force: true });
const reasons = new Map<string, number>();
for (const r of rejected) reasons.set(r.reason.replace(/\d+/g, "N").slice(0, 60), (reasons.get(r.reason.replace(/\d+/g, "N").slice(0, 60)) ?? 0) + 1);
console.log(`\n${served.length} served from ${new Set(served.map((s) => s.id)).size} agencies (${served.filter((s) => s.kind === "live").length} live), ${rejected.length} rejected`);
for (const [reason, n] of [...reasons].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`  ${n} x ${reason}`);
