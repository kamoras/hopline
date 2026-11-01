import type { DataFiles } from "../gtfs/dataset";
import { createLiveProvider } from "../gtfs/live-provider";

const files: DataFiles = (name) => import(`../../../data/prt-bus/${name}.json`);

/** Pittsburgh Regional Transit Bus via its public GTFS-Realtime feeds (keyless). */
export const prtBusProvider = createLiveProvider({
  id: "prt-bus",
  name: "Pittsburgh Regional Transit Bus",
  mode: "bus",
  regionIds: ["pittsburgh"],
  attribution: {
    label: "Pittsburgh Regional Transit",
    url: "https://www.rideprt.org",
    notice: "Pittsburgh Regional Transit (formerly Port Authority of Allegheny County) schedule and real-time data are published by PRT. Hopline is not affiliated with PRT.",
  },
  files,
  placeIds: "stop",
  feeds: {
    tripUpdates: "https://truetime.portauthority.org/gtfsrt-bus/trips",
    vehicles: "https://truetime.portauthority.org/gtfsrt-bus/vehicles",
    alerts: "https://truetime.portauthority.org/gtfsrt-bus/alerts",
  },
});
