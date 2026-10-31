import { lazyStaticData, type DataFiles } from "../gtfs/dataset";
import { createScheduledProvider } from "../gtfs/scheduled";

const files: DataFiles = (name) => import(`../../../data/hartford-line/${name}.json`);
const staticData = lazyStaticData(files, { id: "hartford-line", name: "Hartford Line" });

/** Hartford Line (CTrail, operated with Amtrak) from the bundled timetable; there is no public real-time feed yet. */
export const hartfordLineProvider = createScheduledProvider({
  id: "hartford-line",
  name: "Hartford Line",
  attribution: {
    label: "CTDOT",
    url: "https://www.hartfordline.com",
    notice: "Hartford Line schedules are from the Connecticut Department of Transportation. Hopline is not affiliated with CTDOT.",
  },
  regionIds: ["northeast"],
  staticData,
});
