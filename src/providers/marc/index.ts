import { createRealtimeRailProvider } from "../gtfs/rail-provider";
import { createStaticData, type GtfsStaticData, type RawTrips } from "../gtfs/static";
import routes from "../../../data/marc/routes.json";
import services from "../../../data/marc/services.json";
import shapes from "../../../data/marc/shapes.json";
import stops from "../../../data/marc/stops.json";
import trips from "../../../data/marc/trips.json";

export const MARC_ID = "marc";

let loaded: GtfsStaticData | undefined;
const staticData = () =>
  (loaded ??= createStaticData(
    { stops: stops as unknown as Record<string, [string, number, number]>, routes, trips: trips as unknown as RawTrips, services, shapes },
    { id: MARC_ID, name: "MARC Train" },
  ));

/** MARC Train via its GTFS-Realtime feeds plus the bundled schedule. */
export const marcProvider = createRealtimeRailProvider({
  realtime: { id: MARC_ID, name: "MARC Train" },
  attribution: {
    label: "MDOT MTA",
    url: "https://www.mta.maryland.gov/schedule-data",
    notice: "MARC schedule and real-time data provided by the Maryland Transit Administration. Hopline is not affiliated with or endorsed by the MTA Maryland.",
  },
  regionIds: ["northeast"],
  staticData,
  feeds: {
    tripUpdates: process.env.MARC_TRIP_UPDATES_URL || "https://mdotmta-gtfs-rt.s3.amazonaws.com/MARC+RT/marc-tu.pb",
    vehicles: process.env.MARC_VEHICLE_POSITIONS_URL || "https://mdotmta-gtfs-rt.s3.amazonaws.com/MARC+RT/marc-vp.pb",
  },
});
