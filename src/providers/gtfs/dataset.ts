import { createStaticData, type GtfsStaticData, type RawShape, type RawTrips, type StaticBrand, type StaticRoute } from "./static";

/** Runs `load` once, on first use, and shares the result (a failed load is retried next time). */
export function lazy<T>(load: () => Promise<T>): () => Promise<T> {
  let value: Promise<T> | undefined;
  return () => {
    value ??= load().catch((err) => {
      value = undefined;
      throw err;
    });
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
    const [stops, routes, trips, services, shapes] = await Promise.all([
      loadDataFile<Record<string, [string, number, number]>>(files, "stops"),
      loadDataFile<Record<string, StaticRoute>>(files, "routes"),
      loadDataFile<RawTrips>(files, "trips"),
      loadDataFile<string[]>(files, "services"),
      loadDataFile<RawShape[]>(files, "shapes"),
    ]);
    return createStaticData({ stops, routes, trips, services, shapes }, brand);
  });
