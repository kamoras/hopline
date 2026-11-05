import ingested from "../../../catalog/ingested.json";
import { addRegion, getRegion } from "@/domain/region";
import { dataHost } from "../gtfs/dataset";
import { createLiveProvider } from "../gtfs/live-provider";
import { createTimetableProvider } from "../gtfs/timetable-provider";
import type { TransitProvider } from "../types";
import {
  covered,
  enabled,
  MODE_OF,
  regionOf,
  servable,
  type IngestedAgency,
} from "./plan";

/** Generated agencies have no bundled files: their schedules come from the data host, or the provider reports that it has none. */
const noBundledFiles = (id: string) => () =>
  Promise.reject(new Error(`${id}: no bundled data; set HOPLINE_DATA_URL`));

/**
 * A provider for every ingested agency that is switched on (`HOPLINE_STATES`, with `HOPLINE_DATA_URL` set), built by the same
 * factories as the hand-made ones. An agency a hand-built provider already covers is left to it. Registers each agency's region.
 */
export function generatedProviders(
  handBuilt: readonly TransitProvider[],
  states = process.env.HOPLINE_STATES,
  host = dataHost(),
): TransitProvider[] {
  const taken = handBuilt.flatMap((p) =>
    p.regionIds.flatMap((id) => {
      const region = getRegion(id);
      return region ? [{ mode: p.mode, region }] : [];
    }),
  );
  const out: TransitProvider[] = [];
  for (const a of enabled(ingested.served as unknown as IngestedAgency[], states, host)) {
    if (!servable(a) || covered(a, taken)) continue;
    const region = regionOf(a);
    addRegion(region);
    const mode = MODE_OF[a.mode];
    const attribution = {
      label: a.name,
      url: "https://mobilitydatabase.org",
      notice: `${a.name} schedule${a.kind === "live" ? " and real-time" : ""} data are published by the agency and catalogued by the Mobility Database. Hopline is not affiliated with ${a.name}.`,
    };
    const base = {
      id: a.key,
      name: a.name,
      mode,
      regionIds: [region.id],
      attribution,
      files: noBundledFiles(a.key),
      placeIds: mode === "bus" ? ("stop" as const) : ("name" as const),
    };
    out.push(
      a.kind === "live"
        ? createLiveProvider({
            ...base,
            feeds: {
              tripUpdates: a.feeds!.tripUpdates!,
              vehicles: a.feeds!.vehicles!,
              alerts: a.feeds!.alerts,
            },
          })
        : createTimetableProvider(base),
    );
  }
  return out;
}
