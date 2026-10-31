import { createRealtimeRailProvider } from "../gtfs/rail-provider";
import { lazyStaticData, type DataFiles } from "../gtfs/dataset";

export const VRE_ID = "vre";

const files: DataFiles = (name) => import(`../../../data/vre/${name}.json`);
const staticData = lazyStaticData(files, { id: VRE_ID, name: "VRE" });

/** VRE via its GTFS-Realtime feeds plus the bundled schedule. */
export const vreProvider = createRealtimeRailProvider({
  realtime: { id: VRE_ID, name: "VRE" },
  attribution: {
    label: "VRE",
    url: "https://www.vre.org/about/developers/",
    notice: "VRE schedule and real-time data provided by the Virginia Railway Express. Hopline is not affiliated with or endorsed by VRE.",
  },
  regionIds: ["northeast"],
  staticData,
  feeds: {
    tripUpdates: process.env.VRE_TRIP_UPDATES_URL || "https://gtfs.vre.org/containercdngtfsupload/TripUpdateFeed",
    vehicles: process.env.VRE_VEHICLE_POSITIONS_URL || "https://gtfs.vre.org/containercdngtfsupload/VehiclePositionFeed",
  },
});
