import { createRealtimeRailProvider } from "../gtfs/rail-provider";
import { lazyStaticData, type DataFiles } from "../gtfs/dataset";

export const SEPTA_RAIL_ID = "septa-rail";

const files: DataFiles = (name) => import(`../../../data/septa-rail/${name}.json`);
const staticData = lazyStaticData(files, { id: SEPTA_RAIL_ID, name: "SEPTA Regional Rail" });

const BASE = process.env.SEPTA_RAIL_GTFSRT_BASE || "https://www3.septa.org/gtfsrt/septarail-pa-us";

/** SEPTA Regional Rail via SEPTA's keyless GTFS-Realtime feeds (a position and a delay for each train running) plus the bundled schedule. */
export const septaRailProvider = createRealtimeRailProvider({
  realtime: { id: SEPTA_RAIL_ID, name: "SEPTA Regional Rail" },
  attribution: {
    label: "SEPTA",
    url: "https://www.septa.org/developer/",
    notice: "SEPTA schedule and real-time data provided by the Southeastern Pennsylvania Transportation Authority. Hopline is not affiliated with or endorsed by SEPTA.",
  },
  regionIds: ["northeast"],
  staticData,
  feeds: {
    tripUpdates: process.env.SEPTA_RAIL_TRIP_UPDATES_URL || `${BASE}/Trip/rtTripUpdates.pb`,
    vehicles: process.env.SEPTA_RAIL_VEHICLE_POSITIONS_URL || `${BASE}/Vehicle/rtVehiclePosition.pb`,
  },
});
