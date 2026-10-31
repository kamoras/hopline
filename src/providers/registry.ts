import type { Board } from "@/domain/board";
import { getMode } from "@/domain/modes";
import { getRegion } from "@/domain/region";
import { amtrakProvider } from "./amtrak";
import { demoProvider } from "./demo";
import { demoSubwayProvider } from "./demo/subway";
import { hartfordLineProvider } from "./hartford-line";
import { mbtaCommuterRailProvider } from "./mbta-cr";
import { mbtaSubwayProvider } from "./mbta-subway";
import { mnrProvider } from "./mnr";
import { nyctProvider } from "./nyct";
import { shorelineEastProvider } from "./shoreline-east";
import type { TransitProvider } from "./types";

/** Every data source the app knows about. Add new providers here. */
export const PROVIDERS: readonly TransitProvider[] =
  process.env.HOPLINE_DEMO === "1" ? [demoProvider, demoSubwayProvider] : [mnrProvider, mbtaCommuterRailProvider, amtrakProvider, shorelineEastProvider, hartfordLineProvider, nyctProvider, mbtaSubwayProvider];

/** Providers that serve this exact mode and region; nothing else leaks into a board. */
export function selectProviders(all: readonly TransitProvider[], { mode, region }: Board): TransitProvider[] {
  return all.filter((p) => p.mode === mode && p.regionIds.includes(region.id));
}

export const providersFor = (board: Board) => selectProviders(PROVIDERS, board);

/** Every (mode, region) some provider serves, in stable order. */
export function deriveBoards(all: readonly TransitProvider[]): Board[] {
  const boards = new Map<string, Board>();
  for (const p of all) {
    for (const id of p.regionIds) {
      const region = getRegion(id);
      if (region) boards.set(`${p.mode}/${id}`, { mode: p.mode, region });
    }
  }
  return [...boards.values()].sort((a, b) => a.mode.localeCompare(b.mode) || a.region.name.localeCompare(b.region.name));
}

export const listBoards = () => deriveBoards(PROVIDERS);

/** Resolve URL segments to a board, or undefined if nothing serves it. */
export function findBoard(modeSlug: string, regionId: string): Board | undefined {
  const mode = getMode(modeSlug);
  return listBoards().find((b) => b.mode === mode && b.region.id === regionId);
}
