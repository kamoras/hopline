import { lazy, lazyStaticData } from "../gtfs/dataset";
import { createSubwayStatic } from "../gtfs/subway";

export const WMATA_ID = "wmata";

const metroData = lazyStaticData(WMATA_ID, { id: WMATA_ID, name: "Washington Metro" });

/** Metrorail's stations, lines and track, loaded on first use. */
export const loadWmataStatic = lazy(async () => createSubwayStatic(await metroData()));
