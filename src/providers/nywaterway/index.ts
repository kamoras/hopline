import type { DataFiles } from "../gtfs/dataset";
import { createLiveProvider } from "../gtfs/live-provider";

export const NY_WATERWAY_ID = "nywaterway";

const files: DataFiles = (name) => import(`../../../data/nywaterway/${name}.json`);
const BASE = process.env.NY_WATERWAY_GTFSRT_BASE || "https://nywaterway.connexionz.net/rtt/public/utility/gtfsrealtime.aspx";

/** NY Waterway's Hudson River ferries (New Jersey to Manhattan) via its public GTFS-Realtime feeds. Keyless. */
export const nyWaterwayProvider = createLiveProvider({
  id: NY_WATERWAY_ID,
  name: "NY Waterway",
  mode: "ferry",
  regionIds: ["nyc"],
  attribution: {
    label: "NY Waterway",
    url: "https://www.nywaterway.com",
    notice: "NY Waterway schedule and real-time data are published by NY Waterway. Hopline is not affiliated with or endorsed by NY Waterway.",
  },
  files,
  placeIds: "name",
  feeds: {
    tripUpdates: `${BASE}/tripupdate`,
    vehicles: `${BASE}/vehicleposition`,
    alerts: `${BASE}/alert`,
  },
});
