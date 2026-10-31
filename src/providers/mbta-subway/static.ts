import { lazy, lazyStaticData, type DataFiles } from "../gtfs/dataset";
import { createSubwayStatic, type SubwayStatic } from "../gtfs/subway";

export const MBTA_SUBWAY_ID = "mbta-subway";

export type { LineInfo, Station } from "../gtfs/subway";
export type MbtaSubwayStatic = SubwayStatic;
export const createMbtaSubwayStatic = createSubwayStatic;

const files: DataFiles = (name) => import(`../../../data/mbta-subway/${name}.json`);
const subwayData = lazyStaticData(files, { id: MBTA_SUBWAY_ID, name: "MBTA Subway" });

/** The T's stations, lines and track, loaded on first use. */
export const loadMbtaSubwayStatic = lazy(async () => createMbtaSubwayStatic(await subwayData()));
