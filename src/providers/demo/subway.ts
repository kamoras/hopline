import { transit_realtime as rt } from "gtfs-realtime-bindings";
import { NYC } from "@/domain/region";
import { project } from "@/lib/polyline";
import { buildLineStatus } from "../nyct/alerts";
import { buildNyctArrivals, buildNyctTrips } from "../nyct/normalize";
import { loadNyctStatic, type NyctStatic } from "../nyct/static";
import type { TransitProvider } from "../types";
import { nyctProvider } from "../nyct";

/**
 * Offline demo subway (`HOPLINE_DEMO=1`): trains placed along each line's real track, with stop times
 * derived from the stations beside it, fed through the *real* normalizer. It exercises the same code as production.
 */
const SPEED = 11; // m/s
const DWELL_MS = 25_000;
const TRAINS_PER_DIRECTION = 4;

function syntheticFeed(data: NyctStatic, now: number): rt.FeedMessage {
  const entities: rt.IFeedEntity[] = [];
  for (const routeId of Object.keys(data.routes)) {
    for (const dir of ["N", "S"] as const) {
      const shape = data.shapeFor("demo", routeId, dir);
      if (!shape) continue;
      const total = shape.cum.at(-1) ?? 0;
      // Stations within ~150 m of this track, in travel order.
      const onTrack = data.stations
        .map((s) => ({ s, p: project(shape, s) }))
        .filter(({ p }) => p.offMeters < 150)
        .sort((a, b) => a.p.along - b.p.along);
      if (onTrack.length < 4) continue;
      for (let k = 0; k < TRAINS_PER_DIRECTION; k++) {
        const here = total * ((k + 0.3) / TRAINS_PER_DIRECTION);
        const ahead = onTrack.filter(({ p }) => p.along > here);
        if (ahead.length < 2) continue;
        let t = now;
        let along = here;
        const updates = ahead.map(({ s, p }) => {
          t += ((p.along - along) / SPEED) * 1000 + DWELL_MS;
          along = p.along;
          const platform = s.platforms.find((x) => x.endsWith(dir));
          return platform ? { stopId: platform, arrival: { time: Math.floor(t / 1000) } } : undefined;
        });
        entities.push({
          id: `demo-${routeId}-${dir}-${k}`,
          tripUpdate: { trip: { tripId: `${k}_${routeId}..${dir}`, routeId }, stopTimeUpdate: updates.filter((u): u is NonNullable<typeof u> => !!u) },
        });
      }
    }
  }
  return rt.FeedMessage.decode(rt.FeedMessage.encode(rt.FeedMessage.create({ header: { gtfsRealtimeVersion: "2.0", timestamp: Math.floor(now / 1000) }, entity: entities })).finish());
}

/** A handful of realistic alerts, so the status UI can be developed and checked offline. */
function syntheticAlerts(now: number): rt.FeedMessage {
  const alert = (id: string, routes: string[], effect: rt.Alert.Effect, headline: string, description?: string): rt.IFeedEntity => ({
    id,
    alert: {
      effect,
      headerText: { translation: [{ text: headline, language: "en" }] },
      descriptionText: description ? { translation: [{ text: description, language: "en" }] } : undefined,
      informedEntity: routes.map((routeId) => ({ routeId })),
    },
  });
  const E = rt.Alert.Effect;
  return rt.FeedMessage.decode(
    rt.FeedMessage.encode(
      rt.FeedMessage.create({
        header: { gtfsRealtimeVersion: "2.0", timestamp: Math.floor(now / 1000) },
        entity: [
          alert("a", ["A", "C"], E.SIGNIFICANT_DELAYS, "Some northbound A and C trains are running with delays", "Delays are due to a signal problem at 59 St-Columbus Circle. Allow extra travel time."),
          alert("b", ["L"], E.MODIFIED_SERVICE, "Planned work: late nights, L trains run every 20 minutes", "Overnight track work between Bedford Av and Lorimer St."),
          alert("c", ["7"], E.NO_SERVICE, "No 7 trains between Queensboro Plaza and Flushing-Main St", "Use the Q66 or Q44 bus as an alternative."),
          alert("d", ["4"], E.DETOUR, "4 trains are running local in Brooklyn"),
        ],
      }),
    ).finish(),
  );
}

/** Same synthetic feed, so arrivals in demo mode agree with the trains on the map. */
export const demoSubwayProvider: TransitProvider = {
  ...nyctProvider,
  id: "nyct",
  async fetchTrips({ now, region, diag }) {
    const staticData = await loadNyctStatic();
    return buildNyctTrips({ staticData, feeds: [syntheticFeed(staticData, now)], region: region ?? NYC, now, diag });
  },
  async fetchLineStatus({ now }) {
    return buildLineStatus({ staticData: await loadNyctStatic(), feed: syntheticAlerts(now), now });
  },
  async fetchArrivals({ now }, place) {
    const staticData = await loadNyctStatic();
    return buildNyctArrivals({ staticData, feeds: [syntheticFeed(staticData, now)], platforms: place.codes ?? [], now });
  },
};
