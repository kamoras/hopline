import type { DataFiles } from "../gtfs/dataset";
import { createLiveProvider } from "../gtfs/live-provider";

const files: DataFiles = (name) => import(`../../../data/barta/${name}.json`);

/** BARTA via its public GTFS-Realtime feeds (keyless). */
export const bartaProvider = createLiveProvider({
  id: "barta",
  name: "BARTA",
  mode: "bus",
  regionIds: ["reading"],
  attribution: {
    label: "BARTA",
    url: "https://www.bartabus.com",
    notice: "BARTA (Berks Area Regional Transportation Authority) schedule and real-time data are published by BARTA. Hopline is not affiliated with BARTA.",
  },
  files,
  placeIds: "stop",
  feeds: {
    tripUpdates: "https://busfinder.bartabus.com/Infopoint/gtfs-realtime.ashx?type=tripupdate",
    vehicles: "https://busfinder.bartabus.com/Infopoint/gtfs-realtime.ashx?type=vehicleposition",
  },
});
