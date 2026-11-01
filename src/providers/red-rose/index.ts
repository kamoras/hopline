import type { DataFiles } from "../gtfs/dataset";
import { createLiveProvider } from "../gtfs/live-provider";

const files: DataFiles = (name) => import(`../../../data/red-rose/${name}.json`);

/** Red Rose Transit via its public GTFS-Realtime feeds (keyless). */
export const redRoseProvider = createLiveProvider({
  id: "red-rose",
  name: "Red Rose Transit",
  mode: "bus",
  regionIds: ["lancaster"],
  attribution: {
    label: "Red Rose Transit Authority",
    url: "https://www.redrosetransit.com",
    notice: "Red Rose Transit Authority (Lancaster) schedule and real-time data are published by RRTA. Hopline is not affiliated with RRTA.",
  },
  files,
  placeIds: "stop",
  feeds: {
    tripUpdates: "https://busfinder.redrosetransit.com/Infopoint/gtfs-realtime.ashx?type=tripupdate",
    vehicles: "https://busfinder.redrosetransit.com/Infopoint/gtfs-realtime.ashx?type=vehicleposition",
    alerts: "https://busfinder.redrosetransit.com/Infopoint/gtfs-realtime.ashx?type=alert",
  },
});
