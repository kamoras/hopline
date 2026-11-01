import type { DataFiles } from "../gtfs/dataset";
import { createLiveProvider } from "../gtfs/live-provider";

const files: DataFiles = (name) => import(`../../../data/portland-me/${name}.json`);

/** Greater Portland Metro via its public GTFS-Realtime feeds (keyless). */
export const portlandMeProvider = createLiveProvider({
  id: "portland-me",
  name: "Greater Portland Metro",
  mode: "bus",
  regionIds: ["portland-me"],
  attribution: {
    label: "Greater Portland METRO",
    url: "https://www.gpmetro.org",
    notice: "Greater Portland METRO schedule and real-time data are published by Greater Portland Transit District. Hopline is not affiliated with it.",
  },
  files,
  placeIds: "stop",
  feeds: {
    tripUpdates: "https://gtfsrt.gptd.cadavl.com/ProfilGtfsRt2_0RSProducer-GPTD/TripUpdate.pb",
    vehicles: "https://gtfsrt.gptd.cadavl.com/ProfilGtfsRt2_0RSProducer-GPTD/VehiclePosition.pb",
    alerts: "https://gtfsrt.gptd.cadavl.com/ProfilGtfsRt2_0RSProducer-GPTD/Alert.pb",
  },
});
