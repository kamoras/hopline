import { lazy, lazyStaticData, type DataFiles } from "../gtfs/dataset";
import { createSubwayStatic } from "../gtfs/subway";

export const MTA_BUS_ID = "mta-bus";

const files: DataFiles = (name) => import(`../../../data/mta-bus/${name}.json`);
const busData = lazyStaticData(files, { id: MTA_BUS_ID, name: "NYC Bus" });

/** NYC bus stops, routes and track (all five boroughs and the MTA Bus Company), loaded on first use. Every stop is its own place. */
export const loadMtaBusStatic = lazy(async () => createSubwayStatic(await busData(), "stop"));
