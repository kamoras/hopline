import type { Trip } from "@/domain/trip";
import { indexAlerts } from "../gtfs/alerts";
import { staticLinesAndPlaces } from "../gtfs/scheduled";
import type { FetchContext, TransitProvider } from "../types";
import { buildMnrTrips, MNR_ID } from "./normalize";
import { fetchAlerts, fetchRealtime } from "./realtime";
import { loadStaticData } from "./static";

/** Metro-North Railroad via MTA GTFS-Realtime plus the bundled static schedule. */
export const mnrProvider: TransitProvider = {
  id: MNR_ID,
  name: "Metro-North",
  attribution: {
    label: "MTA",
    url: "https://www.mta.info/developers",
    notice: "Metro-North schedule and real-time data provided by the MTA. Hopline is not affiliated with or endorsed by the MTA.",
  },
  mode: "rail",
  regionIds: ["northeast"],

  async fetchTrips({ region, signal, now, diag }: FetchContext): Promise<Trip[]> {
    const [realtime, alertFeed] = await Promise.all([fetchRealtime(signal), fetchAlerts(signal)]);
    return buildMnrTrips({
      staticData: await loadStaticData(),
      realtime,
      alerts: indexAlerts(alertFeed, now),
      region,
      now,
      diag,
    });
  },

  ...staticLinesAndPlaces(loadStaticData),
};
