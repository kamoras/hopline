/**
 * Converts the Metro-North static GTFS feed into compact JSON the API reads at
 * runtime (so there is no database and no parsing on cold start).
 *
 *   npm run data:mnr                    # download the current feed
 *   npm run data:mnr -- ./gtfs.zip      # use a local copy
 *   npm run data:mnr -- --days 90       # schedule horizon (default 60)
 *
 * Output: data/mnr/{stops,routes,trips,meta}.json
 */
import AdmZip from "adm-zip";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FEED_URL = process.env.MNR_GTFS_URL ?? "https://rrgtfsfeeds.s3.amazonaws.com/gtfsmnr.zip";
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "mnr");

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

function minutes(hms: string): number {
  const [h = "0", m = "0", s = "0"] = hms.split(":");
  return Math.round((Number(h) * 3600 + Number(m) * 60 + Number(s)) / 60);
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10).replaceAll("-", "");
}

async function loadZip(arg: string | undefined): Promise<AdmZip> {
  if (arg) return new AdmZip(readFileSync(arg));
  const res = await fetch(FEED_URL);
  if (!res.ok) throw new Error(`Failed to download ${FEED_URL}: ${res.status}`);
  return new AdmZip(Buffer.from(await res.arrayBuffer()));
}

async function main() {
  const args = process.argv.slice(2);
  const daysIdx = args.indexOf("--days");
  const days = daysIdx >= 0 ? Number(args[daysIdx + 1]) : 60;
  const local = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--days");

  const zip = await loadZip(local);
  const read = (name: string) => {
    const entry = zip.getEntry(name);
    if (!entry) throw new Error(`${name} missing from GTFS feed`);
    return parseCsv(entry.getData().toString("utf8"));
  };

  const today = new Date();
  const from = ymd(new Date(today.getTime() - 2 * 86_400_000));
  const to = ymd(new Date(today.getTime() + days * 86_400_000));

  // Which service ids run inside the horizon.
  const active = new Set<string>();
  for (const r of read("calendar_dates.txt")) {
    if (r.exception_type === "1" && r.date! >= from && r.date! <= to) active.add(r.service_id!);
  }

  const trips: Record<string, [string, string, string, number, string]> = {};
  for (const t of read("trips.txt")) {
    if (active.has(t.service_id!)) {
      trips[t.trip_id!] = [t.trip_short_name!, t.route_id!, t.trip_headsign!, Number(t.direction_id), ""];
    }
  }

  const byTrip = new Map<string, { seq: number; stop: string; arr: number; dep: number }[]>();
  for (const st of read("stop_times.txt")) {
    if (!trips[st.trip_id!]) continue;
    const list = byTrip.get(st.trip_id!) ?? [];
    list.push({
      seq: Number(st.stop_sequence),
      stop: st.stop_id!,
      arr: minutes(st.arrival_time!),
      dep: minutes(st.departure_time!),
    });
    byTrip.set(st.trip_id!, list);
  }
  for (const [id, list] of byTrip) {
    list.sort((a, b) => a.seq - b.seq);
    // "stopId@arrivalMin" or "stopId@arrivalMin-departureMin" when the train dwells.
    trips[id]![4] = list.map((s) => `${s.stop}@${s.arr}${s.dep !== s.arr ? `-${s.dep}` : ""}`).join(";");
  }
  for (const id of Object.keys(trips)) if (!trips[id]![4]) delete trips[id];

  const stops: Record<string, [string, number, number]> = {};
  for (const s of read("stops.txt")) stops[s.stop_id!] = [s.stop_name!, Number(s.stop_lat), Number(s.stop_lon)];

  const routes: Record<string, { name: string; color: string }> = {};
  for (const r of read("routes.txt")) {
    routes[r.route_id!] = { name: r.route_long_name || r.route_short_name!, color: `#${r.route_color || "0b5ea8"}` };
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const write = (name: string, data: unknown) => writeFileSync(join(OUT_DIR, name), JSON.stringify(data) + "\n");
  write("stops.json", stops);
  write("routes.json", routes);
  write("trips.json", trips);
  write("meta.json", {
    source: FEED_URL,
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
