import type { DataFiles } from "../gtfs/dataset";
import { createLiveProvider } from "../gtfs/live-provider";

const files: DataFiles = (name) => import(`../../../data/prt-rail/${name}.json`);

/** The T (Pittsburgh Light Rail) via its public GTFS-Realtime feeds (keyless). */
export const prtRailProvider = createLiveProvider({
  id: "prt-rail",
  name: "The T (Pittsburgh Light Rail)",
  mode: "subway",
  regionIds: ["pittsburgh"],
  attribution: {
    label: "Pittsburgh Regional Transit",
    url: "https://www.rideprt.org",
    notice: "Pittsburgh Regional Transit (formerly Port Authority of Allegheny County) schedule and real-time data are published by PRT. Hopline is not affiliated with PRT.",
  },
  files,
  placeIds: "name",
  feeds: {
    tripUpdates: "https://truetime.portauthority.org/gtfsrt-train/trips",
    vehicles: "https://truetime.portauthority.org/gtfsrt-train/vehicles",
    alerts: "https://truetime.portauthority.org/gtfsrt-train/alerts",
  },
});
