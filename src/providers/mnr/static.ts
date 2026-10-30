import { createStaticData, type GtfsStaticData, type RawTrips } from "../gtfs/static";
import routes from "../../../data/mnr/routes.json";
import services from "../../../data/mnr/services.json";
import stops from "../../../data/mnr/stops.json";
import shapes from "../../../data/mnr/shapes.json";
import trips from "../../../data/mnr/trips.json";

let loaded: GtfsStaticData | undefined;

/**
 * Builds the lookup once per server instance. The JSON is bundled with the
 * server code (never sent to browsers) so there is no filesystem access at runtime.
 */
export function loadStaticData(): GtfsStaticData {
  loaded ??= createStaticData(
    {
      stops: stops as unknown as Record<string, [string, number, number]>,
      routes,
      trips: trips as unknown as RawTrips,
      services,
      shapes,
    },
    { id: "mnr", name: "Metro-North", routeLabel: (name) => `${name} Line` },
  );
  return loaded;
}
