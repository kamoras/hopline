import { lazy, lazyStaticData, type DataFiles } from "../gtfs/dataset";
import { createSubwayStatic } from "../gtfs/subway";

export const WMATA_BUS_ID = "wmata-bus";

const files: DataFiles = (name) => import(`../../../data/wmata-bus/${name}.json`);
const busData = lazyStaticData(files, { id: WMATA_BUS_ID, name: "Metrobus" });

/** Metrobus stops, routes and track, loaded on first use. Every stop is its own place. */
export const loadWmataBusStatic = lazy(async () => createSubwayStatic(await busData(), "stop"));
