import { lazyStaticData } from "../gtfs/dataset";
import { createScheduledProvider } from "../gtfs/scheduled";

const staticData = lazyStaticData("shoreline-east", { id: "shoreline-east", name: "Shore Line East" });

/** Shore Line East (CTrail) from the bundled timetable; there is no public real-time feed yet. */
export const shorelineEastProvider = createScheduledProvider({
  id: "shoreline-east",
  name: "Shore Line East",
  attribution: {
    label: "CTDOT",
    url: "https://www.shorelineeast.com",
    notice: "Shore Line East schedules are from the Connecticut Department of Transportation. Hopline is not affiliated with CTDOT.",
  },
  regionIds: ["northeast"],
  staticData,
});
