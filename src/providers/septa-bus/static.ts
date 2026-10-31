import { lazy, lazyStaticData, type DataFiles } from "../gtfs/dataset";
import { createSubwayStatic } from "../gtfs/subway";

export const SEPTA_BUS_ID = "septa-bus";

const files: DataFiles = (name) => import(`../../../data/septa-bus/${name}.json`);
const busData = lazyStaticData(files, { id: SEPTA_BUS_ID, name: "SEPTA Bus" });

/** SEPTA's bus and trolley stops, routes and track, loaded on first use. Every stop is its own place. */
export const loadSeptaBusStatic = lazy(async () => createSubwayStatic(await busData(), "stop"));
