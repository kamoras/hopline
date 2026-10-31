import { lazyStaticData, type DataFiles } from "../gtfs/dataset";

/** Metro-North's schedule, loaded on first use. */
const files: DataFiles = (name) => import(`../../../data/mnr/${name}.json`);
export const loadStaticData = lazyStaticData(files, { id: "mnr", name: "Metro-North", routeLabel: (name) => `${name} Line` });
