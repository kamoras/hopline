import { createStaticData, type GtfsStaticData, type RawTrips } from "../gtfs/static";
import { createScheduledProvider } from "../gtfs/scheduled";
import routes from "../../../data/hartford-line/routes.json";
import services from "../../../data/hartford-line/services.json";
import shapes from "../../../data/hartford-line/shapes.json";
import stops from "../../../data/hartford-line/stops.json";
import trips from "../../../data/hartford-line/trips.json";

let loaded: GtfsStaticData | undefined;
const staticData = () =>
  (loaded ??= createStaticData(
    { stops: stops as unknown as Record<string, [string, number, number]>, routes, trips: trips as unknown as RawTrips, services, shapes },
    { id: "hartford-line", name: "Hartford Line" },
  ));

/** Hartford Line (CTrail, operated with Amtrak) from the bundled timetable; there is no public real-time feed yet. */
export const hartfordLineProvider = createScheduledProvider({
  id: "hartford-line",
  name: "Hartford Line",
  attribution: {
    label: "CTDOT",
    url: "https://www.hartfordline.com",
    notice: "Hartford Line schedules are from the Connecticut Department of Transportation. Hopline is not affiliated with CTDOT.",
  },
  regionIds: ["northeast"],
  staticData,
});
