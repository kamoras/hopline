import type { DataFiles } from "../gtfs/dataset";
import { createLiveProvider } from "../gtfs/live-provider";

export const MBTA_FERRY_ID = "mbta-ferry";

const files: DataFiles = (name) => import(`../../../data/mbta-ferry/${name}.json`);

/** The MBTA's Boston Harbor ferries via its GTFS-Realtime feeds (shared with its trains and buses; only ferry routes are kept). */
export const mbtaFerryProvider = createLiveProvider({
  id: MBTA_FERRY_ID,
  name: "MBTA Ferry",
  mode: "ferry",
  regionIds: ["boston"],
  attribution: {
    label: "MBTA",
    url: "https://www.mbta.com/developers",
    notice: "MBTA real-time data provided by the Massachusetts Bay Transportation Authority. Hopline is not affiliated with or endorsed by the MBTA.",
  },
  files,
  placeIds: "name",
  feeds: {
    tripUpdates: process.env.MBTA_TRIP_UPDATES_URL || "https://cdn.mbta.com/realtime/TripUpdates.pb",
    vehicles: process.env.MBTA_VEHICLE_POSITIONS_URL || "https://cdn.mbta.com/realtime/VehiclePositions.pb",
    alerts: process.env.MBTA_ALERTS_URL || "https://cdn.mbta.com/realtime/Alerts.pb",
  },
  // Optional: raises the MBTA's rate limit. Read per request so the secret is never captured at startup.
  headers: (): Record<string, string> => (process.env.MBTA_API_KEY ? { "x-api-key": process.env.MBTA_API_KEY } : {}),
});
