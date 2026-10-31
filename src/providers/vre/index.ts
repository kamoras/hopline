import { createRealtimeRailProvider } from "../gtfs/rail-provider";
import { createStaticData, type GtfsStaticData, type RawTrips } from "../gtfs/static";
import routes from "../../../data/vre/routes.json";
import services from "../../../data/vre/services.json";
import shapes from "../../../data/vre/shapes.json";
import stops from "../../../data/vre/stops.json";
import trips from "../../../data/vre/trips.json";

export const VRE_ID = "vre";

let loaded: GtfsStaticData | undefined;
const staticData = () =>
  (loaded ??= createStaticData(
    { stops: stops as unknown as Record<string, [string, number, number]>, routes, trips: trips as unknown as RawTrips, services, shapes },
    { id: VRE_ID, name: "VRE" },
  ));

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
