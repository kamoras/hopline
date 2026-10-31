import type { Arrival } from "@/domain/arrival";
import type { Region } from "@/domain/region";
import { inBounds } from "@/domain/region";
import type { Diagnostics, StopCall, Trip } from "@/domain/trip";
import { bearing, distanceMiles, type LatLon } from "@/lib/geo";
import type { MotionLeg } from "@/lib/motion";
import { finalizeTrip } from "../finalize";
import type { Airport } from "./airports";
import { carrierOf } from "./carriers";

export const ADSB_ID = "adsb";

const KNOT_MPS = 0.514444;
const MPH_PER_KNOT = 1.15078;
const NM_PER_MILE = 0.868976;
/** The map extends each plane along its heading for this long past the data, so it keeps flying between refreshes. */
const GLIDE_MS = 25_000;
/** A position older than this is a plane we have lost, not one to draw. */
const MAX_AGE_S = 45;
/** Airline callsigns are a three-letter code and a number ("DAL1283"); the rest is general aviation and military. */
const AIRLINE_CALLSIGN = /^[A-Z]{3}\d{1,4}[A-Z]{0,2}$/;
/** Arrivals further out than this are not "due" yet. */
const ARRIVALS_HORIZON_MS = 60 * 60_000;
const ARRIVALS_MAX = 60;

/** One aircraft as adsb.lol (readsb) reports it; only the fields we use. */
export interface Aircraft {
  hex: string;
  flight?: string;
  t?: string;
  lat?: number;
  lon?: number;
  /** Feet, or "ground". */
  alt_baro?: number | "ground";
  /** Knots. */
  gs?: number;
  /** Degrees; the direction of travel. */
  track?: number;
  /** Feet per minute. */
  baro_rate?: number;
  geom_rate?: number;
  /** Seconds since the position was last updated. */
  seen_pos?: number;
}

type Phase = { kind: "arriving" | "departing"; airport: Airport; nm: number } | { kind: "overflying" };

const angleDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
const nm = (a: LatLon, b: LatLon) => distanceMiles(a, b) * NM_PER_MILE;

/**
 * What a flight is doing relative to the airports we cover. ADS-B carries no route, so this is inferred from
 * the physics: descending toward an airport is arriving there; climbing away from one close to it just left it.
 */
export function classify(ac: Required<Pick<Aircraft, "lat" | "lon" | "track">> & Aircraft, airports: readonly Airport[]): Phase {
  const alt = typeof ac.alt_baro === "number" ? ac.alt_baro : 0;
  const rate = ac.baro_rate ?? ac.geom_rate ?? 0;
  let best: Phase | undefined;
  for (const airport of airports) {
    const distance = nm(ac, airport);
    const toward = angleDiff(bearing(ac, airport), ac.track);
    const away = angleDiff(bearing(airport, ac), ac.track);
    const descending = rate < -200 || (alt < 4000 && rate <= 0);
    // A plane can only be landing here if it is low enough to get down in the distance left: about 300 ft per
    // nautical mile (a three-degree glide) plus some margin. One flying past a small airport on the way to a
    // bigger one is still too high for the small one.
    const canLand = alt <= 350 * distance + 2500;
    if (alt < 18_000 && descending && canLand && toward < 35 && distance < 60 && (!best || best.kind !== "arriving" || distance < best.nm)) {
      best = { kind: "arriving", airport, nm: distance };
    } else if (!best && alt < 12_000 && rate > 300 && away < 45 && distance < 40) {
      best = { kind: "departing", airport, nm: distance };
    }
  }
  return best ?? { kind: "overflying" };
}

/** `meters` from `from` along `heading` degrees (flat-earth, fine over the few km of a glide). */
function advance(from: LatLon, heading: number, meters: number): LatLon {
  const rad = (heading * Math.PI) / 180;
  return {
    lat: from.lat + (meters * Math.cos(rad)) / 110_540,
    lon: from.lon + (meters * Math.sin(rad)) / (111_320 * Math.cos((from.lat * Math.PI) / 180)),
  };
}

export interface FlightsInput {
  aircraft: readonly Aircraft[];
  airports: readonly Airport[];
  region: Region;
  now: number;
  diag?: Diagnostics;
}

const bump = (d: Diagnostics | undefined, key: string) => {
  if (d) d[key] = Number(d[key] ?? 0) + 1;
};

interface Flight {
  ac: Aircraft & { lat: number; lon: number; track: number; gs: number };
  callsign: string;
  phase: Phase;
}

/** The airline flights worth showing: in the air, reporting a fresh position, inside the region. */
function airborneFlights({ aircraft, airports, region, diag }: FlightsInput): Flight[] {
  const out: Flight[] = [];
  for (const ac of aircraft) {
    bump(diag, "aircraft");
    const callsign = (ac.flight ?? "").trim();
    if (!AIRLINE_CALLSIGN.test(callsign)) continue;
    if (ac.alt_baro === "ground" || ac.lat === undefined || ac.lon === undefined || ac.track === undefined || !ac.gs) continue;
    if ((ac.seen_pos ?? 0) > MAX_AGE_S) {
      bump(diag, "stale");
      continue;
    }
    if (!inBounds(region, ac.lat, ac.lon)) continue;
    const typed = ac as Flight["ac"];
    out.push({ ac: typed, callsign, phase: classify(typed, airports) });
  }
  return out;
}

/**
 * Flights in the air over the region, from ADS-B. Positions are real (reported by the aircraft), so no
 * schedule is involved and no lateness is claimed. Each flight gets a short glide along its heading so the
 * map keeps it moving smoothly between the ten-second refreshes.
 */
export function buildFlights(input: FlightsInput): Trip[] {
  const { now, diag } = input;
  const trips = airborneFlights(input).map(({ ac, callsign, phase }): Trip => {
    const seenMs = (ac.seen_pos ?? 0) * 1000;
    const at: LatLon = { lat: ac.lat, lon: ac.lon };
    const mps = ac.gs * KNOT_MPS;
    const t0 = now - seenMs;
    const end = advance(at, ac.track, (mps * (now + GLIDE_MS - t0)) / 1000);
    const motion: MotionLeg[] = [{ t0, t1: now + GLIDE_MS, path: [at.lat, at.lon, end.lat, end.lon] }];
    const now2 = advance(at, ac.track, (mps * seenMs) / 1000);

    const stops: StopCall[] =
      phase.kind === "arriving"
        ? [{ id: phase.airport.code, name: phase.airport.name, state: "upcoming", arrival: now + (phase.nm / ac.gs) * 3_600_000 }]
        : [];
    const { name } = carrierOf(callsign);
    bump(diag, phase.kind);
    return finalizeTrip({
      id: `${ADSB_ID}:${ac.hex}`,
      operatorId: ADSB_ID,
      mode: "flights",
      number: callsign,
      routeName: `${name}${ac.t ? ` ${ac.t}` : ""}`,
      routeColor: "#3b5b92",
      origin: phase.kind === "departing" ? phase.airport.name : "",
      destination: phase.kind === "arriving" ? phase.airport.name : "",
      state: "enroute",
      position: {
        lat: now2.lat,
        lon: now2.lon,
        heading: ac.track,
        speedMph: ac.gs * MPH_PER_KNOT,
        altitudeFt: typeof ac.alt_baro === "number" ? ac.alt_baro : undefined,
        source: "reported",
      },
      motion,
      stops,
      updatedAt: t0,
    });
  });
  if (diag) diag.kept = trips.length;
  return trips;
}

/**
 * Flights due at an airport: those descending toward it, soonest first, with the time they should reach
 * it at their current speed. A guess from physics, labeled as such in the UI; there is no schedule here.
 */
export function buildFlightArrivals(input: FlightsInput & { airport: string }): Arrival[] {
  const { now, airport } = input;
  return airborneFlights(input)
    .flatMap(({ ac, callsign, phase }) => {
      if (phase.kind !== "arriving" || phase.airport.code !== airport) return [];
      const at = now + (phase.nm / ac.gs) * 3_600_000;
      if (at > now + ARRIVALS_HORIZON_MS) return [];
      const { code } = carrierOf(callsign);
      return [{ tripId: `${ADSB_ID}:${ac.hex}`, route: code, color: "#3b5b92", textColor: "#FFFFFF", headsign: `${callsign}${ac.t ? ` · ${ac.t}` : ""}`, at, platform: "" } satisfies Arrival];
    })
    .sort((a, b) => a.at - b.at)
    .slice(0, ARRIVALS_MAX);
}
