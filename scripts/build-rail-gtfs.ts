/**
 * Converts a commuter-rail static GTFS feed into compact JSON the API reads at
 * runtime (so there is no database and no parsing on cold start).
 *
 *   npm run data:mnr                                  # download the current feed
 *   npm run data:shoreline-east -- --zip ./gtfs.zip   # use a local copy
 *   npm run data:mnr -- --days 90                     # schedule horizon (default 60)
 *
 * Output: data/<agency>/{stops,routes,trips,services,shapes,meta}.json
 * To add an agency: add it to AGENCIES below, add an npm script, and register a provider.
 */
import AdmZip from "adm-zip";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPolyline, project, slicePolyline, type Polyline } from "../src/lib/polyline";

/** The schedule's track number; "BUS" marks a replacement bus, which has no track. */
function trackOf(raw: string | undefined): string {
  const t = (raw ?? "").trim();
  return t.toUpperCase() === "BUS" ? "" : t;
}

/** `url` is where the feed is downloaded from; agencies without one need `--zip`. */
const AGENCIES: Record<string, { url?: string }> = {
  mnr: { url: process.env.MNR_GTFS_URL ?? "https://rrgtfsfeeds.s3.amazonaws.com/gtfsmnr.zip" },
  "shoreline-east": { url: process.env.SHORELINE_EAST_GTFS_URL },
  "hartford-line": { url: process.env.HARTFORD_LINE_GTFS_URL },
};
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

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
    }
    else if (c === "\n" || c === "\r") {
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
  const lat0 = points[0]![0];
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
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

/** Largest gap between consecutive shape points, in meters. Coarse shapes are chords, not track. */
function maxGapMeters(points: [number, number][]): number {
  let max = 0;
  for (let i = 1; i < points.length; i++) {
    const dy = (points[i]![0] - points[i - 1]![0]) * 110_540;
    const dx = (points[i]![1] - points[i - 1]![1]) * 111_320 * Math.cos((points[i]![0] * Math.PI) / 180);
    max = Math.max(max, Math.hypot(dx, dy));
  }
  return max;
}

/** Some schedule shapes have a handful of points over tens of km. Anything with a gap beyond this is not track. */
const COARSE_GAP_M = 600;

function minutes(hms: string): number {
  const [h = "0", m = "0", s = "0"] = hms.split(":");
  return Math.round((Number(h) * 3600 + Number(m) * 60 + Number(s)) / 60);
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10).replaceAll("-", "");
}

async function loadZip(url: string | undefined, local: string | undefined): Promise<AdmZip> {
  if (local) return new AdmZip(readFileSync(local));
  if (!url) throw new Error("No download URL for this agency; pass --zip <file> (or set its *_GTFS_URL variable)");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
  return new AdmZip(Buffer.from(await res.arrayBuffer()));
}

const arg = (args: string[], flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

/** Every date from `a` to `b` (YYYYMMDD, inclusive) on one of the given weekdays (0 = Sunday). */
function datesBetween(a: string, b: string, weekdays: Set<number>): string[] {
  const parse = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(4, 6)) - 1, Number(d.slice(6, 8)));
  const out: string[] = [];
  for (let t = parse(a); t <= parse(b); t += 86_400_000) {
    if (weekdays.has(new Date(t).getUTCDay())) out.push(ymd(new Date(t)));
  }
  return out;
}

const WEEKDAY_COLUMNS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

async function main() {
  const args = process.argv.slice(2);
  const agencyId = args[0] ?? "";
  const agency = AGENCIES[agencyId];
  if (!agency) throw new Error(`Usage: build-rail-gtfs <${Object.keys(AGENCIES).join("|")}> [--zip file] [--days n]`);
  const days = Number(arg(args, "--days") ?? 60);
  const OUT_DIR = join(ROOT, "data", agencyId);

  const zip = await loadZip(agency.url, arg(args, "--zip"));
  const optional = (name: string) => {
    const entry = zip.getEntry(name);
    return entry ? parseCsv(entry.getData().toString("utf8")) : [];
  };
  const read = (name: string) => {
    if (!zip.getEntry(name)) throw new Error(`${name} missing from GTFS feed`);
    return optional(name);
  };

  const today = new Date();
  const from = ymd(new Date(today.getTime() - 2 * 86_400_000));
  const to = ymd(new Date(today.getTime() + days * 86_400_000));

  // The dates each service id runs on, inside the horizon. The realtime feed's trip ids are
  // opaque, so trips are matched on train number + service date; this is what makes that possible.
  // Feeds list dates in calendar_dates.txt, in calendar.txt weekly patterns, or both (with exceptions).
  const datesByService = new Map<string, Set<string>>();
  for (const r of optional("calendar.txt")) {
    const weekdays = new Set(WEEKDAY_COLUMNS.flatMap((col, day) => (r[col] === "1" ? [day] : [])));
    const dates = datesBetween(r.start_date! > from ? r.start_date! : from, r.end_date! < to ? r.end_date! : to, weekdays);
    datesByService.set(r.service_id!, new Set(dates));
  }
  for (const r of optional("calendar_dates.txt")) {
    if (r.date! < from || r.date! > to) continue;
    const set = datesByService.get(r.service_id!) ?? new Set<string>();
    if (r.exception_type === "1") set.add(r.date!);
    else if (r.exception_type === "2") set.delete(r.date!);
    datesByService.set(r.service_id!, set);
  }
  const services: string[] = [];
  const serviceIndex = new Map<string, number>();

  // Track geometry, simplified to ~8 m. Trips point at a shape by index so estimated positions
  // can follow the rails instead of cutting straight between stations.
  const rawShapes = new Map<string, [number, number, number][]>();
  for (const s of optional("shapes.txt")) {
    const list = rawShapes.get(s.shape_id!) ?? [];
    list.push([Number(s.shape_pt_sequence), Number(s.shape_pt_lat), Number(s.shape_pt_lon)]);
    rawShapes.set(s.shape_id!, list);
  }
  const shapes: { routeId: string; pts: number[]; coarse?: boolean }[] = [];
  const shapeIndex = new Map<string, number>(); // by simplified geometry, so duplicates share one entry
  const shapeIndexById = new Map<string, number>();
  const coarse = new Set<number>(); // shapes with no real track geometry

  // trip_id -> [trainNumber, routeId, headsign, direction, stopTimes, serviceIndex, shapeIndex]
  const trips: Record<string, [string, string, string, number, string, number, number]> = {};
  for (const t of read("trips.txt")) {
    const dates = datesByService.get(t.service_id!);
    if (!dates?.size) continue;
    let idx = serviceIndex.get(t.service_id!);
    if (idx === undefined) {
      idx = services.push([...dates].sort().join(",")) - 1;
      serviceIndex.set(t.service_id!, idx);
    }
    let shape = shapeIndexById.get(t.shape_id!);
    if (shape === undefined) {
      const raw = (rawShapes.get(t.shape_id!) ?? []).sort((a, b) => a[0] - b[0]).map(([, la, lo]) => [la, lo] as [number, number]);
      if (raw.length >= 2 && maxGapMeters(raw) > COARSE_GAP_M) {
        // Not real track geometry: build this line from the trip's own station sequence once stop times are read.
        shape = shapes.push({ routeId: t.route_id!, pts: [], coarse: true }) - 1;
        coarse.add(shape);
      } else {
        const pts = simplify(raw, 8);
        const flat = pts.flatMap(([la, lo]) => [Math.round(la * 1e5) / 1e5, Math.round(lo * 1e5) / 1e5]);
        const key = `${t.route_id}:${flat.join(",")}`;
        shape = flat.length < 4 ? -1 : (shapeIndex.get(key) ?? shapes.push({ routeId: t.route_id!, pts: flat }) - 1);
        shapeIndex.set(key, shape);
      }
      shapeIndexById.set(t.shape_id!, shape);
    }
    trips[t.trip_id!] = [t.trip_short_name!, t.route_id!, t.trip_headsign!, Number(t.direction_id), "", idx, shape];
  }

  const byTrip = new Map<string, { seq: number; stop: string; arr: number; dep: number; track: string }[]>();
  for (const st of read("stop_times.txt")) {
    if (!trips[st.trip_id!]) continue;
    const list = byTrip.get(st.trip_id!) ?? [];
    list.push({
      seq: Number(st.stop_sequence),
      stop: st.stop_id!,
      arr: minutes(st.arrival_time!),
      dep: minutes(st.departure_time!),
      track: trackOf(st.track),
    });
    byTrip.set(st.trip_id!, list);
  }
  for (const [id, list] of byTrip) {
    list.sort((a, b) => a.seq - b.seq);
    // "stopId@arrivalMin[-departureMin][#track]": the departure when the train dwells, the scheduled track if known.
    trips[id]![4] = list
      .map((s) => `${s.stop}@${s.arr}${s.dep !== s.arr ? `-${s.dep}` : ""}${s.track ? `#${s.track}` : ""}`)
      .join(";");
  }
  for (const id of Object.keys(trips)) if (!trips[id]![4]) delete trips[id];

  const stops: Record<string, [string, number, number]> = {};
  for (const s of read("stops.txt")) stops[s.stop_id!] = [s.stop_name!, Number(s.stop_lat), Number(s.stop_lon)];

  // Coarse shapes have no real geometry. Rebuild them from the stations the longest trip on them serves,
  // but follow real track wherever it exists: a branch shares its trunk's rails (Waterbury trains leave
  // Bridgeport on the New Haven Line), so each hop between two stations is cut from a detailed shape that
  // passes through both. Only stretches no detailed shape covers fall back to a straight segment.
  const detailed: Polyline[] = shapes.filter((s) => !s.coarse && s.pts.length >= 4).map((s) => createPolyline(s.pts));
  const SNAP_M = 150;
  const hop = (a: { lat: number; lon: number }, b: { lat: number; lon: number }): number[] => {
    let best: { cost: number; piece: number[] } | undefined;
    for (const line of detailed) {
      const pa = project(line, a);
      const pb = project(line, b);
      const cost = pa.offMeters + pb.offMeters;
      if (pa.offMeters <= SNAP_M && pb.offMeters <= SNAP_M && Math.abs(pa.along - pb.along) > 50 && (!best || cost < best.cost)) {
        best = { cost, piece: slicePolyline(line, pa.along, pb.along) };
      }
    }
    return best?.piece ?? [a.lat, a.lon, b.lat, b.lon];
  };

  const longest = new Map<number, { stops: number; id: string }>();
  for (const [id, t] of Object.entries(trips)) {
    if (!coarse.has(t[6])) continue;
    const n = t[4].split(";").length;
    if (n > (longest.get(t[6])?.stops ?? 0)) longest.set(t[6], { stops: n, id });
  }
  for (const [idx, { id }] of longest) {
    const seq = trips[id]![4]
      .split(";")
      .map((p) => stops[p.split("@")[0]!])
      .filter((s): s is [string, number, number] => !!s)
      .map(([, lat, lon]) => ({ lat, lon }));
    const flat: number[] = [];
    for (let i = 0; i + 1 < seq.length; i++) {
      const piece = hop(seq[i]!, seq[i + 1]!);
      // Pieces share their end points; drop the repeated one.
      flat.push(...(flat.length >= 2 && flat[flat.length - 2] === piece[0] && flat[flat.length - 1] === piece[1] ? piece.slice(2) : piece));
    }
    const pts: [number, number][] = [];
    for (let i = 0; i + 1 < flat.length; i += 2) pts.push([flat[i]!, flat[i + 1]!]);
    shapes[idx]!.pts = simplify(pts, 8).flatMap(([la, lo]) => [Math.round(la * 1e5) / 1e5, Math.round(lo * 1e5) / 1e5]);
  }

  const routes: Record<string, { name: string; color: string }> = {};
  for (const r of read("routes.txt")) {
    routes[r.route_id!] = { name: r.route_long_name || r.route_short_name!, color: `#${r.route_color || "0b5ea8"}` };
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const write = (name: string, data: unknown) => writeFileSync(join(OUT_DIR, name), JSON.stringify(data) + "\n");
  write("stops.json", stops);
  write("routes.json", routes);
  write("trips.json", trips);
  write("services.json", services);
  write("shapes.json", shapes);
  write("meta.json", {
    source: agency.url ?? arg(args, "--zip") ?? "local file",
    generatedOn: ymd(today),
    horizon: { from, to },
    tripCount: Object.keys(trips).length,
  });
  console.log(`Wrote ${Object.keys(trips).length} trips, ${Object.keys(stops).length} stops to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
