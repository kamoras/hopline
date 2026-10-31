import { lazy, lazyStaticData, type DataFiles } from "../gtfs/dataset";
import { createSubwayStatic } from "../gtfs/subway";

export const MBTA_BUS_ID = "mbta-bus";

const files: DataFiles = (name) => import(`../../../data/mbta-bus/${name}.json`);
const busData = lazyStaticData(files, { id: MBTA_BUS_ID, name: "MBTA Bus" });

/** The T's bus stops, routes and track, loaded on first use. Every stop is its own place (stops share names). */
export const loadMbtaBusStatic = lazy(async () => createSubwayStatic(await busData(), "stop"));
