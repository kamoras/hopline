import { createStaticData, type GtfsStaticData, type RawTrips } from "../gtfs/static";
import { createScheduledProvider } from "../gtfs/scheduled";
import routes from "../../../data/shoreline-east/routes.json";
import services from "../../../data/shoreline-east/services.json";
import shapes from "../../../data/shoreline-east/shapes.json";
import stops from "../../../data/shoreline-east/stops.json";
import trips from "../../../data/shoreline-east/trips.json";

let loaded: GtfsStaticData | undefined;
const staticData = () =>
  (loaded ??= createStaticData(
    { stops: stops as unknown as Record<string, [string, number, number]>, routes, trips: trips as unknown as RawTrips, services, shapes },
    { id: "shoreline-east", name: "Shore Line East" },
  ));

/** Shore Line East (CTrail) from the bundled timetable; there is no public real-time feed yet. */
export const shorelineEastProvider = createScheduledProvider({
  id: "shoreline-east",
  name: "Shore Line East",
  attribution: {
    label: "CTDOT",
    url: "https://www.shorelineeast.com",
    notice: "Shore Line East schedules are from the Connecticut Department of Transportation. Hopline is not affiliated with CTDOT.",
  },
  regionIds: ["northeast"],
  staticData,
});
