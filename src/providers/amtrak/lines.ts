import type { Line } from "@/domain/line";
import { clipToRegion, type Region } from "@/domain/region";
import { lazyStaticData } from "../gtfs/dataset";

const staticData = lazyStaticData("amtrak", { id: "amtrak", name: "Amtrak" });

/** Amtrak's Northeast track from its GTFS (`npm run data:amtrak`), cut to the region. Trips come from Amtraker. */
export async function amtrakLines(region: Region): Promise<Line[]> {
  const all = (await staticData()).lines();
  return all.flatMap((line) => clipToRegion(region, line.coords).map((coords, i) => ({ ...line, id: `${line.id}-${i}`, coords })));
}
