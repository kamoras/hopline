import type { DataFiles } from "../gtfs/dataset";
import { createLiveProvider } from "../gtfs/live-provider";

export const NYC_FERRY_ID = "nyc-ferry";

const files: DataFiles = (name) => import(`../../../data/nyc-ferry/${name}.json`);
const BASE = process.env.NYC_FERRY_GTFSRT_BASE || "https://nycferry.connexionz.net/rtt/public/utility/gtfsrealtime.aspx";

/** NYC Ferry (Hornblower) via its public GTFS-Realtime feeds: each vessel's GPS position and where it is headed. Keyless. */
export const nycFerryProvider = createLiveProvider({
  id: NYC_FERRY_ID,
  name: "NYC Ferry",
  mode: "ferry",
  regionIds: ["nyc"],
  attribution: {
    label: "NYC Ferry",
    url: "https://www.ferry.nyc/developer-tools",
    notice: "NYC Ferry schedule and real-time data are published by NYC Ferry for developers. Hopline is not affiliated with or endorsed by NYC Ferry.",
  },
  files,
  placeIds: "name",
  feeds: {
    tripUpdates: process.env.NYC_FERRY_TRIP_UPDATES_URL || `${BASE}/tripupdate`,
    vehicles: process.env.NYC_FERRY_VEHICLE_POSITIONS_URL || `${BASE}/vehicleposition`,
    alerts: process.env.NYC_FERRY_ALERTS_URL || `${BASE}/alert`,
  },
});
