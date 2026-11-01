import type { DataFiles } from "../gtfs/dataset";
import { createLiveProvider } from "../gtfs/live-provider";

const files: DataFiles = (name) => import(`../../../data/dash/${name}.json`);

/** DASH (Alexandria) via its public GTFS-Realtime feeds (keyless). */
export const dashProvider = createLiveProvider({
  id: "dash",
  name: "DASH (Alexandria)",
  mode: "bus",
  regionIds: ["washington"],
  attribution: {
    label: "DASH",
    url: "https://www.dashbus.com",
    notice: "DASH (Alexandria Transit Company) schedule and real-time data are published by DASH. Hopline is not affiliated with DASH.",
  },
  files,
  placeIds: "stop",
  feeds: {
    tripUpdates: "https://realtime.prod.dash.obaweb.org/agency/71/tripUpdates",
    vehicles: "https://realtime.prod.dash.obaweb.org/agency/71/vehiclePositions",
  },
});
