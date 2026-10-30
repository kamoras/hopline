import type { Line } from "@/domain/line";
import { clipToRegion, type Region } from "@/domain/region";
import { createStaticData, type RawTrips } from "../gtfs/static";
import routes from "../../../data/amtrak/routes.json";
import services from "../../../data/amtrak/services.json";
import shapes from "../../../data/amtrak/shapes.json";
import stops from "../../../data/amtrak/stops.json";
import trips from "../../../data/amtrak/trips.json";

/** Amtrak's Northeast track from its GTFS (`npm run data:amtrak`), cut to the region. Trips come from Amtraker. */
export function amtrakLines(region: Region): Line[] {
  const all = createStaticData(
    { stops: stops as Record<string, [string, number, number]>, routes, trips: trips as unknown as RawTrips, services, shapes },
    { id: "amtrak", name: "Amtrak" },
  ).lines();
  return all.flatMap((line) => clipToRegion(region, line.coords).map((coords, i) => ({ ...line, id: `${line.id}-${i}`, coords })));
}
