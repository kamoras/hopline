import type { DataFiles } from "../gtfs/dataset";
import { createLiveProvider } from "../gtfs/live-provider";

const files: DataFiles = (name) => import(`../../../data/fairfax-connector/${name}.json`);

/** Fairfax Connector via its public GTFS-Realtime feeds (keyless). */
export const fairfaxConnectorProvider = createLiveProvider({
  id: "fairfax-connector",
  name: "Fairfax Connector",
  mode: "bus",
  regionIds: ["washington"],
  attribution: {
    label: "Fairfax County",
    url: "https://www.fairfaxcounty.gov/connector/",
    notice: "Fairfax Connector schedule and real-time data are published by Fairfax County. Hopline is not affiliated with Fairfax County.",
  },
  files,
  placeIds: "stop",
  feeds: {
    tripUpdates: "https://www.fairfaxcounty.gov/gtfsrt/trips",
    vehicles: "https://www.fairfaxcounty.gov/gtfsrt/vehicles",
    alerts: "https://www.fairfaxcounty.gov/gtfsrt/alerts",
  },
});
