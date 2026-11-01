import type { DataFiles } from "../gtfs/dataset";
import { createLiveProvider } from "../gtfs/live-provider";

const files: DataFiles = (name) => import(`../../../data/cttransit/${name}.json`);

/** CTtransit via its public GTFS-Realtime feeds (keyless). */
export const cttransitProvider = createLiveProvider({
  id: "cttransit",
  name: "CTtransit",
  mode: "bus",
  regionIds: ["connecticut"],
  attribution: {
    label: "CTDOT · CTtransit",
    url: "https://www.cttransit.com",
    notice: "CTtransit schedule and real-time data are published by the Connecticut Department of Transportation. Hopline is not affiliated with CTDOT or CTtransit.",
  },
  files,
  placeIds: "stop",
  feeds: {
    tripUpdates: process.env.CTTRANSIT_TRIP_UPDATES_URL || "https://cttprdtmgtfs.ctttrpcloud.com/TMGTFSRealTimeWebService/TripUpdate/TripUpdates.pb",
    vehicles: process.env.CTTRANSIT_VEHICLE_POSITIONS_URL || "https://cttprdtmgtfs.ctttrpcloud.com/TMGTFSRealTimeWebService/Vehicle/VehiclePositions.pb",
    alerts: process.env.CTTRANSIT_ALERTS_URL || "https://cttprdtmgtfs.ctttrpcloud.com/TMGTFSRealTimeWebService/Alert/Alerts.pb",
  },
});
