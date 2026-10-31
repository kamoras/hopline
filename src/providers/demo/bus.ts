import type { Arrival } from "@/domain/arrival";
import type { LineStatus } from "@/domain/line-status";
import type { Trip } from "@/domain/trip";
import { createPolyline, pointAlong, polylineLength, project } from "@/lib/polyline";
import { finalizeTrip } from "../finalize";
import { mbtaBusProvider } from "../mbta-bus";
import { loadMbtaBusStatic, MBTA_BUS_ID } from "../mbta-bus/static";
import type { TransitProvider } from "../types";

/**
 * Offline demo buses (`HOPLINE_DEMO=1`): vehicles driven along each route's real track, so the viewport-scoped
 * board (zoomed-in vehicles, a followed route, stops by name) can be exercised without live feeds.
 */
const SPEED = 6; // m/s, about 13 mph
const PER_ROUTE = 3;

export const demoBusProvider: TransitProvider = {
  ...mbtaBusProvider,
  async fetchTrips({ now }): Promise<Trip[]> {
    const { data, lines } = await loadMbtaBusStatic();
    const seen = new Set<string>();
    const trips: Trip[] = [];
    for (const line of data.lines()) {
      if (!line.route || seen.has(line.route)) continue;
      seen.add(line.route);
      const poly = createPolyline(line.coords.flatMap(([lon, lat]) => [lat, lon]));
      const length = polylineLength(poly);
      for (let k = 0; k < PER_ROUTE; k++) {
        const along = ((now / 1000) * SPEED + (k * length) / PER_ROUTE) % length;
        const p = pointAlong(poly, along);
        trips.push(
          finalizeTrip({
            id: `${MBTA_BUS_ID}:demo-${line.route}-${k}`,
            operatorId: MBTA_BUS_ID,
            mode: "bus",
            number: line.route,
            routeName: lines[Object.keys(lines).find((id) => lines[id]!.short === line.route) ?? ""]?.name ?? line.name,
            routeColor: line.color,
            origin: "",
            destination: "",
            state: "enroute",
            position: { lat: p.lat, lon: p.lon, heading: p.heading, speedMph: SPEED * 2.23694, source: "reported" },
            stops: [],
            updatedAt: now,
          }),
        );
      }
    }
    return trips;
  },
  async fetchArrivals({ now }, place): Promise<Arrival[]> {
    // Routes whose track passes within about 100 m of the stop, with made-up times.
    const { data, lines } = await loadMbtaBusStatic();
    const at = { lat: place.lat, lon: place.lon };
    const routes = new Set<string>();
    for (const line of data.lines()) {
      if (line.route && project(createPolyline(line.coords.flatMap(([lon, lat]) => [lat, lon])), at).offMeters < 100) routes.add(line.route);
    }
    return [...routes].slice(0, 4).flatMap((route, i) => {
      const info = Object.values(lines).find((l) => l.short === route)!;
      return [3 + i * 2, 12 + i * 3].map((min): Arrival => ({ tripId: `demo-${route}-${min}`, route, color: info.color, textColor: info.text ?? "#000000", headsign: info.name, at: now + min * 60_000, platform: place.id }));
    });
  },
  /** Two made-up alerts on real routes, so the service-alert strip is exercised. */
  async fetchLineStatus(): Promise<LineStatus[]> {
    const { data } = await loadMbtaBusStatic();
    const states = [
      ["delays", "Delays on route"],
      ["change", "Detour on route"],
    ] as const;
    return data.lines().slice(0, states.length).map((line, i): LineStatus => {
      const [state, text] = states[i]!;
      const route = line.route ?? line.name;
      return { route, color: line.color, textColor: "#FFFFFF", state, alerts: [{ headline: `${text} ${route}`, state }] };
    });
  },
};
