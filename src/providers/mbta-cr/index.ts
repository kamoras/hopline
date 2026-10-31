import { createRealtimeRailProvider } from "../gtfs/rail-provider";
import { createStaticData, type GtfsStaticData, type RawTrips } from "../gtfs/static";
import routes from "../../../data/mbta-cr/routes.json";
import services from "../../../data/mbta-cr/services.json";
import shapes from "../../../data/mbta-cr/shapes.json";
import stops from "../../../data/mbta-cr/stops.json";
import trips from "../../../data/mbta-cr/trips.json";

export const MBTA_CR_ID = "mbta-cr";

let loaded: GtfsStaticData | undefined;
const staticData = () =>
  (loaded ??= createStaticData(
    { stops: stops as unknown as Record<string, [string, number, number]>, routes, trips: trips as unknown as RawTrips, services, shapes },
    { id: MBTA_CR_ID, name: "MBTA Commuter Rail" },
  ));

/** MBTA Commuter Rail via the MBTA's GTFS-Realtime feeds (shared with its buses, subway and ferries) plus the bundled schedule. */
export const mbtaCommuterRailProvider = createRealtimeRailProvider({
  realtime: { id: MBTA_CR_ID, name: "MBTA Commuter Rail" },
  attribution: {
    label: "MBTA",
    url: "https://www.mbta.com/developers",
    notice: "MBTA schedule and real-time data provided by the Massachusetts Bay Transportation Authority. Hopline is not affiliated with or endorsed by the MBTA.",
  },
  regionIds: ["northeast"],
  staticData,
  feeds: {
    tripUpdates: process.env.MBTA_TRIP_UPDATES_URL || "https://cdn.mbta.com/realtime/TripUpdates.pb",
    vehicles: process.env.MBTA_VEHICLE_POSITIONS_URL || "https://cdn.mbta.com/realtime/VehiclePositions.pb",
    alerts: process.env.MBTA_ALERTS_URL || "https://cdn.mbta.com/realtime/Alerts.pb",
  },
  // Optional: raises the MBTA's rate limit.
  apiKey: { value: process.env.MBTA_API_KEY, header: "x-api-key" },
});
