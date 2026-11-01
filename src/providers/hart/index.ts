import type { DataFiles } from "../gtfs/dataset";
import { createLiveProvider } from "../gtfs/live-provider";

const files: DataFiles = (name) => import(`../../../data/hart/${name}.json`);

/** HART Bus via its public GTFS-Realtime feeds (keyless). */
export const hartProvider = createLiveProvider({
  id: "hart",
  name: "HART Bus",
  mode: "bus",
  regionIds: ["connecticut"],
  attribution: {
    label: "HART",
    url: "https://www.ridehart.org",
    notice: "HART (Housatonic Area Regional Transit) schedule and real-time data are published by HART. Hopline is not affiliated with it.",
  },
  files,
  placeIds: "stop",
  feeds: {
    tripUpdates: "https://passio3.com/hart/passioTransit/gtfs/realtime/tripUpdates",
    vehicles: "https://passio3.com/hart/passioTransit/gtfs/realtime/vehiclePositions",
    alerts: "https://passio3.com/hart/passioTransit/gtfs/realtime/serviceAlerts",
  },
});
