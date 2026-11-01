import type { DataFiles } from "../gtfs/dataset";
import { createTimetableProvider } from "../gtfs/timetable-provider";

const files: DataFiles = (name) => import(`../../../data/roosevelt-tram/${name}.json`);

/** The Roosevelt Island Tramway (Manhattan to Roosevelt Island) from its published timetable. No live feed, so cars are placed by the schedule. */
export const rooseveltTramProvider = createTimetableProvider({
  id: "roosevelt-tram",
  name: "Roosevelt Island Tram",
  mode: "subway",
  regionIds: ["nyc"],
  attribution: {
    label: "RIOC",
    url: "https://rioc.ny.gov/",
    notice: "Roosevelt Island Tramway schedules are published by the Roosevelt Island Operating Corporation. Cars are shown by the timetable. Hopline is not affiliated with RIOC.",
  },
  files,
  placeIds: "name",
});
