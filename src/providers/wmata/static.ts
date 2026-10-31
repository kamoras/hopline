import { lazy, lazyStaticData, type DataFiles } from "../gtfs/dataset";
import { createSubwayStatic } from "../gtfs/subway";

export const WMATA_ID = "wmata";

const files: DataFiles = (name) => import(`../../../data/wmata/${name}.json`);
const metroData = lazyStaticData(files, { id: WMATA_ID, name: "Washington Metro" });

/** Metrorail's stations, lines and track, loaded on first use. */
export const loadWmataStatic = lazy(async () => createSubwayStatic(await metroData()));
