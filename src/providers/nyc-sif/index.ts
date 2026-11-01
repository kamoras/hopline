import { lazy, lazyStaticData, type DataFiles } from "../gtfs/dataset";
import { buildScheduledArrivals, buildScheduledTrips } from "../gtfs/scheduled";
import { createSubwayStatic, subwayPlaces } from "../gtfs/subway";
import type { TransitProvider } from "../types";

export const SI_FERRY_ID = "nyc-sif";

const files: DataFiles = (name) => import(`../../../data/nyc-sif/${name}.json`);
const data = lazyStaticData(files, { id: SI_FERRY_ID, name: "Staten Island Ferry" });
const loadStatic = lazy(async () => createSubwayStatic(await data(), "name"));

/**
 * The Staten Island Ferry (NYC DOT) from its published timetable. It has no live feed, so boats are placed by the
 * schedule and nothing is claimed about lateness.
 */
export const siFerryProvider: TransitProvider = {
  id: SI_FERRY_ID,
  name: "Staten Island Ferry",
  attribution: {
    label: "NYC DOT",
    url: "https://www.nyc.gov/html/dot/html/ferrybus/staten-island-ferry.shtml",
    notice: "Staten Island Ferry schedules are from the NYC Department of Transportation (NYC Open Data). Boats are shown by the timetable. Hopline is not affiliated with NYC DOT.",
  },
  mode: "ferry",
  regionIds: ["nyc"],

  async fetchTrips({ region, now, diag }) {
    return buildScheduledTrips({ id: SI_FERRY_ID, name: "Staten Island Ferry", staticData: (await loadStatic()).data, region, now, mode: "ferry", diag });
  },

  async fetchPlaces({ region }) {
    return subwayPlaces(await loadStatic(), region.id, "ferry");
  },

  async fetchArrivals({ region, now }, place) {
    const s = await loadStatic();
    const lineOf = (routeId: string) => {
      const l = s.lines[routeId];
      return l && { route: l.short, color: l.color, textColor: l.text ?? "#FFFFFF" };
    };
    return buildScheduledArrivals({ staticData: s.data, lineOf, region, platforms: place.codes ?? [], now });
  },

  async fetchLines() {
    return (await loadStatic()).data.lines();
  },
};
