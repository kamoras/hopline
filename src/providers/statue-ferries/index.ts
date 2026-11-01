import type { DataFiles } from "../gtfs/dataset";
import { createTimetableProvider } from "../gtfs/timetable-provider";

const files: DataFiles = (name) => import(`../../../data/statue-ferries/${name}.json`);

/** The Statue of Liberty and Ellis Island ferries (National Park Service) from the published timetable. No live feed. */
export const statueFerriesProvider = createTimetableProvider({
  id: "statue-ferries",
  name: "Statue of Liberty Ferries",
  mode: "ferry",
  regionIds: ["nyc"],
  attribution: {
    label: "National Park Service",
    url: "https://www.nps.gov/stli",
    notice: "Statue of Liberty ferry schedules are published through the National Park Service. Boats are shown by the timetable. Hopline is not affiliated with the NPS or the ferry operator.",
  },
  files,
  placeIds: "name",
});
