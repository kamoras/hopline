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

/** One bundled JSON file of an agency's data (data/<id>/<name>.json), loaded when first asked for. */
export const loadDataFile = async <T>(id: string, name: string): Promise<T> => (await import(`../../../data/${id}/${name}.json`)).default as T;

/**
 * An agency's bundled schedule data, loaded on first use. Each agency's files are separate lazy chunks,
 * so a server instance only reads (and keeps in memory) the agencies whose boards are actually requested.
 */
export const lazyStaticData = (id: string, brand: StaticBrand): (() => Promise<GtfsStaticData>) =>
  lazy(async () => {
    const [stops, routes, trips, services, shapes] = await Promise.all([
      loadDataFile<Record<string, [string, number, number]>>(id, "stops"),
      loadDataFile<Record<string, StaticRoute>>(id, "routes"),
      loadDataFile<RawTrips>(id, "trips"),
      loadDataFile<string[]>(id, "services"),
      loadDataFile<RawShape[]>(id, "shapes"),
    ]);
    return createStaticData({ stops, routes, trips, services, shapes }, brand);
  });
