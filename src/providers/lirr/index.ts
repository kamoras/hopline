import { createRealtimeRailProvider } from "../gtfs/rail-provider";
import { lazyStaticData, type DataFiles } from "../gtfs/dataset";

export const LIRR_ID = "lirr";

const files: DataFiles = (name) => import(`../../../data/lirr/${name}.json`);
const staticData = lazyStaticData(files, { id: LIRR_ID, name: "Long Island Rail Road" });

const MTA = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds";

/** The Long Island Rail Road via the MTA's GTFS-Realtime feed (one feed carries trips and positions) plus the bundled schedule. */
export const lirrProvider = createRealtimeRailProvider({
  realtime: { id: LIRR_ID, name: "Long Island Rail Road" },
  attribution: {
    label: "MTA",
    url: "https://www.mta.info/developers",
    notice: "LIRR schedule and real-time data provided by the MTA. Hopline is not affiliated with or endorsed by the MTA.",
  },
  regionIds: ["northeast"],
  staticData,
  feeds: {
    tripUpdates: process.env.LIRR_REALTIME_URL || `${MTA}/lirr%2Fgtfs-lirr`,
    alerts: process.env.LIRR_ALERTS_URL || `${MTA}/camsys%2Flirr-alerts`,
  },
  apiKey: { value: process.env.MTA_API_KEY, header: "x-api-key" },
});
