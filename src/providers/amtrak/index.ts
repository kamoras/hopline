import { inBounds } from "@/domain/region";
import type { Trip } from "@/domain/trip";
import type { FetchContext, TransitProvider } from "../types";
import { AMTRAK_ID, normalizeAmtrakTrip } from "./normalize";
import { AmtrakStationMetaSchema, AmtrakTrainSchema } from "./schema";

const DEFAULT_BASE_URL = "https://api.amtraker.com/v3";

/** Amtrak via the community-run Amtraker v3 API (no key required). */
export const amtrakProvider: TransitProvider = {
  id: AMTRAK_ID,
  name: "Amtrak",
  attribution: {
    label: "Amtraker",
    url: "https://amtraker.com",
    notice: "Amtrak and the Amtrak logo are trademarks of the National Railroad Passenger Corporation. Hopline is not affiliated with Amtrak.",
  },
  mode: "rail",
  regionIds: ["northeast"],

  async fetchTrips({ region, signal, diag }: FetchContext): Promise<Trip[]> {
    const base = process.env.AMTRAKER_BASE_URL || DEFAULT_BASE_URL;
    const res = await fetch(`${base}/trains`, { signal, cache: "no-store" });
    if (!res.ok) throw new Error(`Amtraker responded ${res.status}`);

    const body: unknown = await res.json();
    if (!body || typeof body !== "object") throw new Error("Amtraker returned an unexpected payload");

    const trips: Trip[] = [];
    diag.trainsInFeed = 0;
    diag.invalidRecords = 0;
    for (const group of Object.values(body as Record<string, unknown>)) {
      if (!Array.isArray(group)) continue;
      for (const raw of group) {
        diag.trainsInFeed = Number(diag.trainsInFeed) + 1;
        const parsed = AmtrakTrainSchema.safeParse(raw);
        if (!parsed.success) {
          diag.invalidRecords = Number(diag.invalidRecords) + 1;
          continue;
        }
        const trip = normalizeAmtrakTrip(parsed.data, region, diag);
        if (trip) trips.push(trip);
      }
    }
    diag.kept = trips.length;
    return trips;
  },

  async fetchPlaces({ region, signal }) {
    const base = process.env.AMTRAKER_BASE_URL || DEFAULT_BASE_URL;
    const res = await fetch(`${base}/stations`, { signal, next: { revalidate: 86_400 } });
    if (!res.ok) throw new Error(`Amtraker responded ${res.status}`);
    const body: unknown = await res.json();
    if (!body || typeof body !== "object") return [];

    return Object.values(body as Record<string, unknown>).flatMap((raw) => {
      const s = AmtrakStationMetaSchema.safeParse(raw);
      if (!s.success || !inBounds(region, s.data.lat, s.data.lon)) return [];
      const codes = s.data.code ? [s.data.code] : undefined;
      return [{ name: s.data.name, lat: s.data.lat, lon: s.data.lon, mode: "rail" as const, regionId: region.id, codes }];
    });
  },
};
