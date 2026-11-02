import { createStaticData, type GtfsStaticData, type RawShape, type RawTrips, type StaticBrand, type StaticRoute } from "./static";

/**
 * Loaded data is kept in memory so each request does not reparse it, but a server that touches hundreds of agencies
 * cannot keep them all: the least recently used values past this many are dropped and load again if asked for. (A value
 * still held by a request in flight stays alive until that request ends; only the shared copy is released.)
 */
export const MAX_RESIDENT = Number(process.env.HOPLINE_MAX_RESIDENT) || 24;

interface Resident {
  reset(): void;
  lastUsed: number;
  loaded: boolean;
}
const residents = new Set<Resident>();

function trim(except: Resident) {
  const loaded = [...residents].filter((r) => r.loaded && r !== except);
  if (loaded.length + 1 <= MAX_RESIDENT) return;
  loaded.sort((a, b) => a.lastUsed - b.lastUsed);
  for (const r of loaded.slice(0, loaded.length + 1 - MAX_RESIDENT)) r.reset();
}

/** How many values are held right now (for tests and the status page). */
export const residentCount = () => [...residents].filter((r) => r.loaded).length;

/** Runs `load` once, on first use, and shares the result (a failed load is retried next time; the least recently used are evicted). */
export function lazy<T>(load: () => Promise<T>): () => Promise<T> {
  let value: Promise<T> | undefined;
  const me: Resident = {
    lastUsed: 0,
    loaded: false,
    reset() {
      value = undefined;
      me.loaded = false;
    },
  };
  residents.add(me);
  return () => {
    me.lastUsed = Date.now();
    if (!value) {
      const loading = load().then(
        (v) => {
          if (value === loading) {
            me.loaded = true;
            trim(me);
          }
          return v;
        },
        (err) => {
          if (value === loading) value = undefined;
          throw err;
        },
      );
      value = loading;
    }
    return value;
  };
}

/**
 * How an agency reads its own bundled files: `(name) => import(\`../../../data/<id>/${name}.json\`)`, written in the
 * agency's provider so the bundler sees one narrow, literal folder per agency (each agency's files become separate
 * lazy chunks, and adding another agency's data can never change what this one resolves).
 */
export type DataFiles = (name: string) => Promise<{ default: unknown }>;

/** One bundled JSON file of an agency's data, loaded when first asked for. */
export const loadDataFile = async <T>(files: DataFiles, name: string): Promise<T> => (await files(name)).default as T;

/**
 * An agency's bundled schedule data, loaded on first use. Each agency's files are separate lazy chunks,
 * so a server instance only reads (and keeps in memory) the agencies whose boards are actually requested.
 */
export const lazyStaticData = (files: DataFiles, brand: StaticBrand): (() => Promise<GtfsStaticData>) =>
  lazy(async () => {
    // With a data host configured, an agency's schedule is fetched from it on first use (so the repository need not carry
    // every agency's files); if that fails, the copy bundled at build time answers instead.
    const remote = await fetchAgencyBundle(brand.id).catch(() => undefined);
    if (remote) return createStaticData(remote, brand);
    const [stops, routes, trips, services, shapes] = await Promise.all([
      loadDataFile<Record<string, [string, number, number]>>(files, "stops"),
      loadDataFile<Record<string, StaticRoute>>(files, "routes"),
      loadDataFile<RawTrips>(files, "trips"),
      loadDataFile<string[]>(files, "services"),
      loadDataFile<RawShape[]>(files, "shapes"),
    ]);
    return createStaticData({ stops, routes, trips, services, shapes }, brand);
  });

/** Where published agency bundles live (a static host, e.g. GitHub Pages): `${url}/${agencyId}.json`. Unset means use the bundled copy. */
export const dataHost = () => process.env.HOPLINE_DATA_URL?.replace(/\/$/, "");

/** One agency's whole schedule as published by `scripts/publish-data.ts`. */
export interface AgencyBundle {
  stops: Record<string, [string, number, number]>;
  routes: Record<string, StaticRoute>;
  trips: RawTrips;
  services: string[];
  shapes: RawShape[];
}

/**
 * Fetches an agency's published bundle, or nothing when no host is configured. Throws when the host does not have it or
 * answers badly, so the caller can fall back to the bundled copy.
 */
export async function fetchAgencyBundle(id: string, host = dataHost()): Promise<AgencyBundle | undefined> {
  if (!host) return undefined;
  const res = await fetch(`${host}/${encodeURIComponent(id)}.json`, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${id}: data host answered ${res.status}`);
  const body = (await res.json()) as Partial<AgencyBundle>;
  if (!body.stops || !body.routes || !body.trips || !body.services || !body.shapes) throw new Error(`${id}: data host sent an incomplete bundle`);
  return body as AgencyBundle;
}
