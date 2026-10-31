import { lazyStaticData } from "../gtfs/dataset";

/** Metro-North's schedule, loaded on first use. */
export const loadStaticData = lazyStaticData("mnr", { id: "mnr", name: "Metro-North", routeLabel: (name) => `${name} Line` });
