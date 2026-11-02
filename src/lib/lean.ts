import type { Mode } from "@/domain/modes";
import type { StopCall, Trip } from "@/domain/trip";

/**
 * What the map polls every few seconds. It needs where a vehicle is and a little about it, not the whole timetable behind
 * it, and the timetable is most of the bytes (a train's stops are two thirds of its JSON). So a lean trip leaves its stops
 * out, and a vehicle's stops are fetched (`/api/trip`) only for the one whose drawer is open.
 *
 * Trains keep the stops that are still ahead, because "A to B", saved commutes and a station's trains are answered from
 * them in the browser; the stops already behind are what the drawer's timeline adds back. Flights keep their first stop
 * (the airport they are descending into), which the map points at.
 */
export function leanTrip(trip: Trip, mode: Mode = trip.mode): Trip {
  const base: Trip = {
    ...trip,
    nextStop: trip.nextStop && leanStop(trip.nextStop),
    // Positions to about a meter: the digits beyond that are noise that does not compress and nobody can see.
    position: trip.position && {
      ...trip.position,
      lat: round(trip.position.lat, 5),
      lon: round(trip.position.lon, 5),
      ...(trip.position.heading !== undefined ? { heading: Math.round(trip.position.heading) } : {}),
      ...(trip.position.speedMph !== undefined ? { speedMph: round(trip.position.speedMph, 1) } : {}),
    },
    motion: trip.motion?.map((leg) => ({ ...leg, path: leg.path.map((n) => round(n, 5)) })),
    destinationAt: trip.destinationAt && { lat: round(trip.destinationAt.lat, 4), lon: round(trip.destinationAt.lon, 4) },
  };
  if (mode === "rail") return { ...base, stops: trip.stops.filter((s) => s.state !== "departed").map(leanStop) };
  if (mode === "flights") return { ...base, stops: trip.stops.slice(0, 1).map(leanStop) };
  return { ...base, stops: [] };
}

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

/** A stop without the fields that only repeat another (the departure of a stop that does not dwell is its arrival). */
function leanStop(s: StopCall): StopCall {
  const { departure, scheduledDeparture, ...rest } = s;
  return {
    ...rest,
    ...(departure !== undefined && departure !== s.arrival ? { departure } : {}),
    ...(scheduledDeparture !== undefined && scheduledDeparture !== s.scheduledArrival ? { scheduledDeparture } : {}),
  };
}
