import { createRealtimeRailProvider } from "../gtfs/rail-provider";
import { lazyStaticData } from "../gtfs/dataset";

export const MBTA_CR_ID = "mbta-cr";

const staticData = lazyStaticData("mbta-cr", { id: MBTA_CR_ID, name: "MBTA Commuter Rail" });

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
