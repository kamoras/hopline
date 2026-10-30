import type { Place } from "@/domain/place";
import { placeSlug } from "@/domain/place";
import type { Trip } from "@/domain/trip";
import type { FetchContext, TransitProvider } from "../types";
import { buildNyctTrips, NYCT_ID } from "./normalize";
import { fetchSubwayFeeds } from "./realtime";
import { loadNyctStatic } from "./static";

/** NYC Subway via the MTA's eight GTFS-Realtime feeds plus bundled static data. */
export const nyctProvider: TransitProvider = {
  id: NYCT_ID,
  name: "NYC Subway",
  attribution: {
    label: "MTA",
    url: "https://www.mta.info/developers",
    notice: "NYC subway real-time data provided by the MTA. Hopline is not affiliated with or endorsed by the MTA.",
  },
  mode: "subway",
  regionIds: ["nyc"],

  async fetchTrips({ region, signal, now, diag }: FetchContext): Promise<Trip[]> {
    const { feeds, failed } = await fetchSubwayFeeds(signal, now);
    if (failed.length) diag.failedFeeds = failed.join("; ");
    return buildNyctTrips({ staticData: loadNyctStatic(), feeds, region, now, diag });
  },

  async fetchPlaces({ region }) {
    const stations = loadNyctStatic().stations;
    // Station names repeat across the city ("86 St", "Canal St"), so ids add the station id when needed.
    const counts = new Map<string, number>();
    for (const s of stations) counts.set(placeSlug(s.name), (counts.get(placeSlug(s.name)) ?? 0) + 1);
    return stations.map((s): Omit<Place, "id"> & { id: string } => {
      const slug = placeSlug(s.name);
      return { id: (counts.get(slug) ?? 0) > 1 ? `${slug}-${s.id.toLowerCase()}` : slug, name: s.name, lat: s.lat, lon: s.lon, mode: "subway", regionId: region.id, codes: s.platforms };
    });
  },

  async fetchLines() {
    return loadNyctStatic().lines();
  },
};
