/**
 * Builds data/mta-bus (NYC buses) from the MTA's per-borough static GTFS feeds.
 *
 * MTA publishes the Bronx, Brooklyn, Manhattan, Queens, Staten Island and MTA Bus Company feeds separately; each
 * lists every NYCT route but only the trips of its own area, so each is built on its own (the same way every other
 * agency is, see build-rail-gtfs.ts) and the results are merged: stops and routes by id, track by route and shape.
 *
 *   npm run data:mta-bus                     # download the six feeds
 *   npm run data:mta-bus -- --dir ./feeds    # use gtfs_bx.zip, gtfs_b.zip, gtfs_m.zip, gtfs_q.zip, gtfs_si.zip, gtfs_busco.zip there
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data", "mta-bus");
const FEEDS = ["bx", "b", "m", "q", "si", "busco"];
const BASE = process.env.MTA_BUS_GTFS_BASE ?? "https://rrgtfsfeeds.s3.amazonaws.com";

const flag = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function feedZip(feed: string, dir: string | undefined, work: string): Promise<string> {
  if (dir) {
    const local = join(dir, `gtfs_${feed}.zip`);
    if (!existsSync(local)) throw new Error(`${local} not found`);
    return local;
  }
  const res = await fetch(`${BASE}/gtfs_${feed}.zip`);
  if (!res.ok) throw new Error(`Failed to download gtfs_${feed}.zip: ${res.status}`);
  const path = join(work, `gtfs_${feed}.zip`);
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  return path;
}

const read = <T>(dir: string, name: string) => JSON.parse(readFileSync(join(dir, name), "utf8")) as T;

async function main() {
  const work = join(ROOT, ".mta-bus-work");
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const dir = flag("--dir");

  const stops: Record<string, [string, number, number]> = {};
  const routes: Record<string, unknown> = {};
  const shapes = new Map<string, { routeId: string; pts: number[] }>();

  for (const feed of FEEDS) {
    const out = join(work, feed);
    const zip = await feedZip(feed, dir, work);
    execFileSync("npx", ["tsx", join(ROOT, "scripts", "build-rail-gtfs.ts"), "mta-bus", "--zip", zip, "--out", out], { stdio: "inherit" });
    Object.assign(stops, read(out, "stops.json"));
    Object.assign(routes, read(out, "routes.json"));
    for (const s of read<{ routeId: string; pts: number[] }[]>(out, "shapes.json")) shapes.set(`${s.routeId}:${s.pts.join(",")}`, s);
  }

  mkdirSync(OUT, { recursive: true });
  const write = (name: string, data: unknown) => writeFileSync(join(OUT, name), JSON.stringify(data) + "\n");
  write("stops.json", stops);
  write("routes.json", routes);
  write("shapes.json", [...shapes.values()]);
  write("trips.json", {});
  write("services.json", []);
  write("meta.json", { source: "MTA per-borough GTFS", generatedOn: new Date().toISOString().slice(0, 10).replaceAll("-", ""), tripCount: 0 });
  rmSync(work, { recursive: true, force: true });
  console.log(`Wrote ${Object.keys(routes).length} routes, ${Object.keys(stops).length} stops, ${shapes.size} shapes to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
