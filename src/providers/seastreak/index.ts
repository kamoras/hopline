import type { DataFiles } from "../gtfs/dataset";
import { createTimetableProvider } from "../gtfs/timetable-provider";

const files: DataFiles = (name) => import(`../../../data/seastreak/${name}.json`);

/** SeaStreak's ferries (Manhattan, New Jersey and Sandy Hook) from its published timetable. No live feed, so boats are placed by the schedule. */
export const seastreakProvider = createTimetableProvider({
  id: "seastreak",
  name: "SeaStreak",
  mode: "ferry",
  regionIds: ["nyc"],
  attribution: {
    label: "SeaStreak",
    url: "https://www.seastreak.com",
    notice: "SeaStreak schedules are published by SeaStreak. Boats are shown by the timetable. Hopline is not affiliated with SeaStreak.",
  },
  files,
  placeIds: "name",
});
