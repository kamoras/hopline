import type { DataFiles } from "../gtfs/dataset";
import { createTimetableProvider } from "../gtfs/timetable-provider";

export const SI_FERRY_ID = "nyc-sif";

const files: DataFiles = (name) => import(`../../../data/nyc-sif/${name}.json`);

/**
 * The Staten Island Ferry (NYC DOT) from its published timetable. It has no live feed, so boats are placed by the
 * schedule and nothing is claimed about lateness.
 */
export const siFerryProvider = createTimetableProvider({
  id: SI_FERRY_ID,
  name: "Staten Island Ferry",
  mode: "ferry",
  regionIds: ["nyc"],
  attribution: {
    label: "NYC DOT",
    url: "https://www.nyc.gov/html/dot/html/ferrybus/staten-island-ferry.shtml",
    notice: "Staten Island Ferry schedules are from the NYC Department of Transportation (NYC Open Data). Boats are shown by the timetable. Hopline is not affiliated with NYC DOT.",
  },
  files,
  placeIds: "name",
});
