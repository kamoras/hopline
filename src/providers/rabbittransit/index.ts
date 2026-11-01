import type { DataFiles } from "../gtfs/dataset";
import { createLiveProvider } from "../gtfs/live-provider";

const files: DataFiles = (name) => import(`../../../data/rabbittransit/${name}.json`);

/** rabbittransit via its public GTFS-Realtime feeds (keyless). */
export const rabbittransitProvider = createLiveProvider({
  id: "rabbittransit",
  name: "rabbittransit",
  mode: "bus",
  regionIds: ["york"],
  attribution: {
    label: "rabbittransit",
    url: "https://www.rabbittransit.org",
    notice: "rabbittransit (York and Adams counties) schedule and real-time data are published by rabbittransit. Hopline is not affiliated with it.",
  },
  files,
  placeIds: "stop",
  feeds: {
    tripUpdates: "https://realtime.rabbittransit.org/InfoPoint/GTFS-Realtime.ashx?Type=TripUpdate",
    vehicles: "https://realtime.rabbittransit.org/InfoPoint/GTFS-Realtime.ashx?Type=VehiclePosition",
    alerts: "https://realtime.rabbittransit.org/InfoPoint/GTFS-Realtime.ashx?Type=Alert",
  },
});
