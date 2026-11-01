import type { Attribution } from "@/domain/trip";
import type { Mode } from "@/domain/modes";
import type { TransitProvider } from "../types";
import { lazy, lazyStaticData, type DataFiles } from "./dataset";
import { buildScheduledArrivals, buildScheduledTrips } from "./scheduled";
import { createSubwayStatic, subwayPlaces, type SubwayStatic } from "./subway";

export interface TimetableProviderConfig {
  id: string;
  name: string;
  mode: Mode;
  regionIds: readonly string[];
  attribution: Attribution;
  files: DataFiles;
  placeIds: "name" | "stop";
}

/**
 * An operator with no live feed: vehicles are placed by the bundled timetable (marked "estimated"), nothing is claimed
 * about lateness, and each station lists its next scheduled departures. Swap in `createLiveProvider` if a feed appears.
 */
export function createTimetableProvider({ id, name, mode, regionIds, attribution, files, placeIds }: TimetableProviderConfig): TransitProvider {
  const data = lazyStaticData(files, { id, name });
  const loadStatic = lazy<SubwayStatic>(async () => createSubwayStatic(await data(), placeIds));

  return {
    id,
    name,
    attribution,
    mode,
    regionIds,

    async fetchTrips({ region, now, diag }) {
      return buildScheduledTrips({ id, name, staticData: (await loadStatic()).data, region, now, mode, diag });
    },

    async fetchPlaces({ region }) {
      return subwayPlaces(await loadStatic(), region.id, mode);
    },

    async fetchArrivals({ region, now }, place) {
      const s = await loadStatic();
      const lineOf = (routeId: string) => {
        const l = s.lines[routeId];
        return l && { route: l.short, color: l.color, textColor: l.text ?? "#FFFFFF" };
      };
      return buildScheduledArrivals({ staticData: s.data, lineOf, region, platforms: place.codes ?? [], now });
    },

    async fetchLines() {
      return (await loadStatic()).data.lines();
    },
  };
}
