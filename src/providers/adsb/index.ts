import type { Place } from "@/domain/place";
import type { Trip } from "@/domain/trip";
import type { FetchContext, TransitProvider } from "../types";
import { NORTHEAST_AIRPORTS } from "./airports";
import { buildAirportStatus, FAA_STATUS_URL } from "./faa";
import { warmRoutes } from "./routes";
import { ADSB_ID, buildFlightArrivals, buildFlights, type Aircraft } from "./normalize";

/** Live aircraft near a point, from adsb.lol's community ADS-B network (no key; asks for fair use). */
const ADSB_URL = process.env.ADSB_API_URL || "https://api.adsb.lol/v2";
/** One query covering the airports: centered between New York and Philadelphia, 150 nautical miles out. */
const CENTER = { lat: 40.55, lon: -74.4 };
const RADIUS_NM = 150;

const REGION_IDS = ["northeast-air"];

/** One shared fetch for trips and arrivals within a moment, so they cost one upstream request. */
let recent: { at: number; aircraft: Promise<Aircraft[]> } | undefined;
const TTL_MS = 4_000;

function fetchAircraft(signal: AbortSignal, now: number): Promise<Aircraft[]> {
  if (recent && now - recent.at < TTL_MS) return recent.aircraft;
  const aircraft = (async () => {
    const res = await fetch(`${ADSB_URL}/point/${CENTER.lat}/${CENTER.lon}/${RADIUS_NM}`, { signal, cache: "no-store" });
    if (!res.ok) throw new Error(`adsb.lol responded ${res.status}`);
    const body = (await res.json()) as { ac?: Aircraft[] };
    if (!Array.isArray(body.ac)) throw new Error("adsb.lol returned an unexpected payload");
    return body.ac;
  })();
  recent = { at: now, aircraft };
  aircraft.catch(() => {
    if (recent?.aircraft === aircraft) recent = undefined; // never reuse a failure
  });
  return aircraft;
}

/**
 * Flights over the airports of the Northeast: real positions from ADS-B, airport delays and ground stops from
 * the FAA. There is no schedule feed here, so no lateness is claimed; its destination comes from a
 * route lookup by callsign (see routes.ts), or from the airport it is descending into.
 */
export const adsbProvider: TransitProvider = {
  id: ADSB_ID,
  name: "Live flights",
  attribution: {
    label: "adsb.lol · FAA",
    url: "https://adsb.lol",
    notice: "Aircraft positions are community ADS-B data from adsb.lol (ODbL); airport status is from the FAA. Hopline is not affiliated with either.",
  },
  mode: "flights",
  regionIds: REGION_IDS,

  async fetchTrips({ region, signal, now, diag }: FetchContext): Promise<Trip[]> {
    const aircraft = await fetchAircraft(signal, now);
    await warmRoutes(aircraft.map((ac) => (ac.flight ?? "").trim()).filter((c) => /^[A-Z]{3}\d{1,4}[A-Z]{0,2}$/.test(c)), now);
    return buildFlights({ aircraft, airports: NORTHEAST_AIRPORTS, region, now, diag });
  },

  async fetchPlaces({ region }) {
    return NORTHEAST_AIRPORTS.map((a): Omit<Place, "id"> & { id: string } => ({
      id: a.code.toLowerCase(),
      name: a.name,
      lat: a.lat,
      lon: a.lon,
      mode: "flights",
      regionId: region.id,
      codes: [a.code],
    }));
  },

  async fetchArrivals({ region, signal, now }, place) {
    const aircraft = await fetchAircraft(signal, now);
    return buildFlightArrivals({ aircraft, airports: NORTHEAST_AIRPORTS, region, now, airport: place.codes?.[0] ?? "" });
  },

  async fetchLineStatus({ signal }) {
    const res = await fetch(process.env.FAA_STATUS_URL || FAA_STATUS_URL, { signal, cache: "no-store" });
    if (!res.ok) throw new Error(`FAA status responded ${res.status}`); // unknown must not read as "good"
    return buildAirportStatus(await res.text(), NORTHEAST_AIRPORTS);
  },
};
