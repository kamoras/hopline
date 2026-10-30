/**
 * Converts the NYC subway static GTFS feed into compact JSON the API reads at runtime.
 * Live trains come from realtime feeds; this supplies everything static about them: stations,
 * line colors, and track geometry.
 *
 *   npm run data:subway                  # download the current feed
 *   npm run data:subway -- ./gtfs.zip    # use a local copy
 *
 * Output: data/subway/{stations,routes,shapes,meta}.json
 */
import AdmZip from "adm-zip";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FEED_URL = process.env.SUBWAY_GTFS_URL ?? "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip";
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "subway");

type Row = Record<string, string>;

function parseCsv(text: string): Row[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const header = rows.shift()?.map((h) => h.replace(/^﻿/, "")) ?? [];
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

/** Douglas-Peucker on [lat, lon] points, tolerance in meters (local flat-earth projection). */
function simplify(points: [number, number][], toleranceM: number): [number, number][] {
  if (points.length < 3) return points;
  const kx = 111_320 * Math.cos((points[0]![0] * Math.PI) / 180);
  const ky = 110_540;
  const xy = points.map(([la, lo]) => [lo * kx, la * ky] as const);
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = xy[a]!;
    const [bx, by] = xy[b]!;
    const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
    let worst = -1;
    let worstD = toleranceM;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i]!;
      const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / len2)) : 0;
      const d = Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)));
      if (d > worstD) {
        worstD = d;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const distM = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
  Math.hypot((a.lon - b.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180), (a.lat - b.lat) * 110_540);

async function main() {
  const local = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const zip = local ? new AdmZip(readFileSync(local)) : new AdmZip(Buffer.from(await (await fetch(FEED_URL)).arrayBuffer()));
  const read = (name: string) => parseCsv(zip.getEntry(name)!.getData().toString("utf8"));

  // Stations: a parent station plus its N/S platforms. Distinct parents that share a name and are close
  // together (Times Sq-42 St has four) are one complex to a rider, so they are merged.
  const rows = read("stops.txt");
  const platformsByParent = new Map<string, string[]>();
  for (const r of rows) if (r.parent_station) platformsByParent.set(r.parent_station, [...(platformsByParent.get(r.parent_station) ?? []), r.stop_id!]);
  const parents = rows
    .filter((r) => r.location_type === "1")
    .map((r) => ({ id: r.stop_id!, name: r.stop_name!, lat: Number(r.stop_lat), lon: Number(r.stop_lon), platforms: platformsByParent.get(r.stop_id!) ?? [] }));

  const stations: { id: string; name: string; lat: number; lon: number; platforms: string[] }[] = [];
  for (const p of parents) {
    const home = stations.find((s) => normalize(s.name) === normalize(p.name) && distM(s, p) < 500);
    if (home) {
      home.platforms.push(...p.platforms);
      home.lat = (home.lat + p.lat) / 2;
      home.lon = (home.lon + p.lon) / 2;
    } else stations.push({ ...p, platforms: [...p.platforms] });
  }

  const routes: Record<string, { short: string; long: string; color: string; text: string }> = {};
  for (const r of read("routes.txt")) {
    routes[r.route_id!] = { short: r.route_short_name || r.route_id!, long: r.route_long_name!, color: `#${r.route_color || "808183"}`, text: `#${r.route_text_color || "FFFFFF"}` };
  }

  // Track geometry. Each shape is used by a route; shapes with identical geometry are stored once.
  const raw = new Map<string, [number, number, number][]>();
  for (const s of read("shapes.txt")) {
    const list = raw.get(s.shape_id!) ?? [];
    list.push([Number(s.shape_pt_sequence), Number(s.shape_pt_lat), Number(s.shape_pt_lon)]);
    raw.set(s.shape_id!, list);
  }
  const routeOfShape = new Map<string, string>();
  const dirOfShape = new Map<string, string>();
  const usage = new Map<string, number>();
  for (const t of read("trips.txt")) {
    routeOfShape.set(t.shape_id!, t.route_id!);
    dirOfShape.set(t.shape_id!, t.direction_id!);
    usage.set(t.shape_id!, (usage.get(t.shape_id!) ?? 0) + 1);
  }
  const shapes: { route: string; pts: number[] }[] = [];
  const byGeometry = new Map<string, number>();
  const byId: Record<string, number> = {};
  for (const [id, pts] of raw) {
    const route = routeOfShape.get(id);
    if (!route) continue;
    const simple = simplify(pts.sort((a, b) => a[0] - b[0]).map(([, la, lo]) => [la, lo] as [number, number]), 10);
    const flat = simple.flatMap(([la, lo]) => [Math.round(la * 1e5) / 1e5, Math.round(lo * 1e5) / 1e5]);
    const key = `${route}:${flat.join(",")}`;
    const idx = byGeometry.get(key) ?? shapes.push({ route, pts: flat }) - 1;
    byGeometry.set(key, idx);
    byId[id] = idx;
  }

  // For trips whose shape id we can't resolve: the most-used shape per route and direction (0 or 1).
  const fallback: Record<string, number> = {};
  const best = new Map<string, number>();
  for (const [id, n] of usage) {
    const route = routeOfShape.get(id);
    const idx = byId[id];
    if (!route || idx === undefined) continue;
    const key = `${route}:${dirOfShape.get(id)}`;
    if (n > (best.get(key) ?? 0)) {
      best.set(key, n);
      fallback[key] = idx;
    }
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const write = (name: string, data: unknown) => writeFileSync(join(OUT_DIR, name), JSON.stringify(data) + "\n");
  write("stations.json", stations.map((s) => [s.id, s.name, Math.round(s.lat * 1e6) / 1e6, Math.round(s.lon * 1e6) / 1e6, s.platforms]));
  write("routes.json", routes);
  write("shapes.json", { shapes, byId, fallback });
  write("meta.json", { source: FEED_URL, generatedOn: new Date().toISOString().slice(0, 10), stations: stations.length, shapes: shapes.length });
  console.log(`Wrote ${stations.length} stations, ${Object.keys(routes).length} routes, ${shapes.length} shapes to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
