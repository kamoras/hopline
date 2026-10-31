import { lazy, lazyStaticData, type DataFiles } from "../gtfs/dataset";
import { fetchGtfsRt } from "../gtfs/feed";
import { summarizeLineStatus } from "../gtfs/line-status";
import { buildScheduledArrivals, buildScheduledTrips } from "../gtfs/scheduled";
import { createSubwayStatic, subwayPlaces } from "../gtfs/subway";
import type { TransitProvider } from "../types";

export const SEPTA_METRO_ID = "septa-metro";

const files: DataFiles = (name) => import(`../../../data/septa-metro/${name}.json`);
const data = lazyStaticData(files, { id: SEPTA_METRO_ID, name: "SEPTA Metro" });
const loadStatic = lazy(async () => createSubwayStatic(await data(), "name"));

const ALERTS = process.env.SEPTA_ALERTS_URL || `${process.env.SEPTA_GTFSRT_BASE || "https://www3.septa.org/gtfsrt/septa-pa-us"}/Service/rtServiceAlerts.pb`;

/** The lines riders know, in order: Market-Frankford, Broad Street, Norristown High Speed. */
const LINE_ORDER = ["L", "B", "M"];

/**
 * SEPTA's Metro (Philadelphia) from its bundled timetable. SEPTA publishes almost no live positions for these lines, so
 * trains are placed by the schedule and nothing is claimed about lateness; service alerts are live (keyless).
 */
export const septaMetroProvider: TransitProvider = {
  id: SEPTA_METRO_ID,
  name: "SEPTA Metro",
  attribution: {
    label: "SEPTA",
    url: "https://www.septa.org/developer/",
    notice: "SEPTA schedules and alerts provided by the Southeastern Pennsylvania Transportation Authority. Metro trains are shown by the timetable. Hopline is not affiliated with or endorsed by SEPTA.",
  },
  mode: "subway",
  regionIds: ["philadelphia"],

  async fetchTrips({ region, now, diag }) {
    return buildScheduledTrips({ id: SEPTA_METRO_ID, name: "SEPTA Metro", staticData: (await loadStatic()).data, region, now, mode: "subway", diag });
  },

  async fetchPlaces({ region }) {
    return subwayPlaces(await loadStatic(), region.id);
  },

  async fetchArrivals({ region, now }, place) {
    const s = await loadStatic();
    const lineOf = (routeId: string) => {
      const l = s.lines[routeId];
      return l && { route: l.short, color: l.color, textColor: l.text ?? "#FFFFFF" };
    };
    return buildScheduledArrivals({ staticData: s.data, lineOf, region, platforms: place.codes ?? [], now });
  },

  async fetchLineStatus({ signal, now }) {
    const { lines } = await loadStatic();
    const style = new Map(Object.values(lines).map((l) => [l.short, { color: l.color, text: l.text ?? "#FFFFFF" }]));
    const feed = await fetchGtfsRt(ALERTS, signal, { ttlMs: 30_000, now }); // a failure means status is unknown, not good
    return summarizeLineStatus({ feed, now, order: LINE_ORDER, lineOf: (routeId) => lines[routeId]?.short, style });
  },

  async fetchLines() {
    return (await loadStatic()).data.lines();
  },
};
