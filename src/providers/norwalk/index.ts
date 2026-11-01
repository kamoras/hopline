import type { DataFiles } from "../gtfs/dataset";
import { createLiveProvider } from "../gtfs/live-provider";

const files: DataFiles = (name) => import(`../../../data/norwalk/${name}.json`);

/** Norwalk Transit via its public GTFS-Realtime feeds (keyless). */
export const norwalkProvider = createLiveProvider({
  id: "norwalk",
  name: "Norwalk Transit",
  mode: "bus",
  regionIds: ["connecticut"],
  attribution: {
    label: "Norwalk Transit District",
    url: "https://www.norwalktransit.com",
    notice: "Norwalk Transit schedule and real-time data are published by the Norwalk Transit District. Hopline is not affiliated with it.",
  },
  files,
  placeIds: "stop",
  feeds: {
    tripUpdates: "https://mystop.norwalktransit.com/InfoPoint/gtfs-realtime.ashx?type=tripupdate",
    vehicles: "https://mystop.norwalktransit.com/InfoPoint/gtfs-realtime.ashx?type=vehicleposition",
    alerts: "https://mystop.norwalktransit.com/InfoPoint/gtfs-realtime.ashx?type=alert",
  },
});
