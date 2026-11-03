/**
 * A small load test for the API: many simulated viewers, each cycling through the requests the map makes.
 *
 *   npm run build && npm start &                     # a production server
 *   npm run loadtest -- --url http://localhost:3000 --viewers 50 --seconds 30
 *
 * Reports, per endpoint, how many requests, errors and the 50th/95th/max latency, plus the server's memory if `--pid` is
 * given. Run it before switching on a large batch of agencies, and compare the numbers with the last run in
 * docs/SCALING_REVIEW.md. It only ever reads public endpoints, and it is polite: viewers wait between rounds like a browser.
 */
import { readFile } from "node:fs/promises";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
};
const BASE = arg("url", "http://localhost:3000").replace(/\/$/, "");
const VIEWERS = Number(arg("viewers", "20"));
const SECONDS = Number(arg("seconds", "30"));
const PID = Number(arg("pid", "0"));
const ROUND_MS = Number(arg("round-ms", "10000")); // a browser polls every 10 s

/** The views people actually have: a few metros with their modes, as the browser asks for them. */
const VIEWS = [
  ["/api/trips?mode=rail&region=northeast&lean=1", "/api/trips?mode=subway&region=nyc&lean=1", "/api/trips?mode=ferry&region=nyc&lean=1", "/api/trips?mode=bus&region=nyc&lean=1&bbox=-74.05,40.65,-73.85,40.85", "/api/boards?bbox=-75,40,-73,41"],
  ["/api/trips?mode=rail&region=northeast&lean=1", "/api/trips?mode=subway&region=boston&lean=1", "/api/trips?mode=bus&region=boston&lean=1&bbox=-71.2,42.3,-71.0,42.4", "/api/boards?bbox=-72,42,-70,43"],
  ["/api/trips?mode=flights&region=northeast-air&lean=1", "/api/trips?mode=rail&region=northeast&lean=1", "/api/trips?mode=subway&region=washington&lean=1", "/api/trips?mode=bus&region=washington&lean=1&bbox=-77.1,38.85,-76.95,38.95"],
  ["/api/trips?mode=bus&region=pittsburgh&lean=1&bbox=-80.05,40.4,-79.9,40.5", "/api/trips?mode=subway&region=pittsburgh&lean=1", "/api/boards?bbox=-81,40,-79,41"],
] as const;
const EXTRA = ["/api/lines?mode=subway&region=nyc", "/api/places?mode=subway&region=nyc", "/api/line-status?mode=subway&region=nyc"];

const stats = new Map<string, { n: number; errors: number; ms: number[]; bytes: number }>();
const key = (url: string) => url.split("?")[0] + (url.includes("mode=") ? ` ${new URL(url, BASE).searchParams.get("mode")}` : "");

async function hit(url: string) {
  const t0 = performance.now();
  let ok = false;
  let bytes = 0;
  try {
    const res = await fetch(BASE + url, { signal: AbortSignal.timeout(30_000) });
    bytes = (await res.arrayBuffer()).byteLength;
    ok = res.ok;
  } catch {
    ok = false;
  }
  const s = stats.get(key(url)) ?? { n: 0, errors: 0, ms: [], bytes: 0 };
  s.n++;
  s.bytes += bytes;
  s.ms.push(performance.now() - t0);
  if (!ok) s.errors++;
  stats.set(key(url), s);
}

async function viewer(i: number, until: number) {
  const view = VIEWS[i % VIEWS.length]!;
  await new Promise((r) => setTimeout(r, Math.random() * ROUND_MS)); // viewers do not arrive in step
  for (let round = 0; Date.now() < until; round++) {
    await Promise.all(view.map(hit));
    if (round === 0) await Promise.all(EXTRA.map(hit)); // the first load also fetches the static layers
    await new Promise((r) => setTimeout(r, ROUND_MS));
  }
}

const rss = async () => {
  if (!PID) return undefined;
  try {
    const m = /VmRSS:\s+(\d+) kB/.exec(await readFile(`/proc/${PID}/status`, "utf8"));
    return m ? Math.round(Number(m[1]) / 1024) : undefined;
  } catch {
    return undefined;
  }
};
const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((xs.length * p) / 100))] ?? 0;

const before = await rss();
const until = Date.now() + SECONDS * 1000;
console.log(`${VIEWERS} viewers for ${SECONDS}s against ${BASE}`);
await Promise.all(Array.from({ length: VIEWERS }, (_, i) => viewer(i, until)));
const after = await rss();

let total = 0;
let errors = 0;
let bytes = 0;
console.log("\nendpoint".padEnd(34), "reqs".padStart(6), "err".padStart(5), "p50 ms".padStart(8), "p95 ms".padStart(8), "max ms".padStart(8), "avg KB".padStart(8));
for (const [k, s] of [...stats].sort()) {
  total += s.n;
  errors += s.errors;
  bytes += s.bytes;
  console.log(k.padEnd(34), String(s.n).padStart(6), String(s.errors).padStart(5), String(Math.round(pct(s.ms, 50))).padStart(8), String(Math.round(pct(s.ms, 95))).padStart(8), String(Math.round(Math.max(...s.ms))).padStart(8), String(Math.round(s.bytes / s.n / 1024)).padStart(8));
}
console.log(`\n${total} requests, ${errors} errors (${((100 * errors) / Math.max(1, total)).toFixed(1)}%), ${(bytes / 1048576).toFixed(1)} MB received${before !== undefined ? `, server memory ${before} to ${after} MB` : ""}`);
process.exit(errors / Math.max(1, total) > 0.05 ? 1 : 0);
