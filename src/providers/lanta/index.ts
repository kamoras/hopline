import type { DataFiles } from "../gtfs/dataset";
import { createLiveProvider } from "../gtfs/live-provider";

const files: DataFiles = (name) => import(`../../../data/lanta/${name}.json`);

/** LANTA via its public GTFS-Realtime feeds (keyless). */
export const lantaProvider = createLiveProvider({
  id: "lanta",
  name: "LANTA",
  mode: "bus",
  regionIds: ["allentown"],
  attribution: {
    label: "LANTA",
    url: "https://www.lantabus.com",
    notice: "LANTA (Lehigh and Northampton Transportation Authority) schedule and real-time data are published by LANTA. Hopline is not affiliated with LANTA.",
  },
  files,
  placeIds: "stop",
  feeds: {
    tripUpdates: "https://realtimelanta.availtec.com/InfoPoint/GTFS-Realtime.ashx?Type=TripUpdate",
    vehicles: "https://realtimelanta.availtec.com/InfoPoint/GTFS-Realtime.ashx?Type=VehiclePosition",
    alerts: "https://realtimelanta.availtec.com/InfoPoint/GTFS-Realtime.ashx?Type=Alert",
  },
});
