import { inBounds } from "@/domain/region";
import type { Trip } from "@/domain/trip";
import type { FetchContext, TransitProvider } from "../types";
import { indexAlerts } from "./alerts";
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
      staticData: loadStaticData(),
      realtime,
      alerts: indexAlerts(alertFeed, now),
      region,
      now,
      diag,
    });
  },

  async fetchLines() {
    return loadStaticData().lines();
  },

  async fetchPlaces({ region }) {
    return Object.values(loadStaticData().stops)
      .filter((s) => inBounds(region, s.lat, s.lon))
      .map((s) => ({ name: s.name, lat: s.lat, lon: s.lon, mode: "rail" as const, regionId: region.id }));
  },
};
