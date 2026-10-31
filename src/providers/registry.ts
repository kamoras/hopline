import type { Board } from "@/domain/board";
import { getMode, MODES } from "@/domain/modes";
import { getRegion } from "@/domain/region";
import { adsbProvider } from "./adsb";
import { amtrakProvider } from "./amtrak";
import { demoProvider } from "./demo";
import { demoBusProvider } from "./demo/bus";
import { demoFlightsProvider } from "./demo/flights";
import { demoSubwayProvider } from "./demo/subway";
import { hartfordLineProvider } from "./hartford-line";
import { marcProvider } from "./marc";
import { mbtaBusProvider } from "./mbta-bus";
import { mbtaCommuterRailProvider } from "./mbta-cr";
import { mbtaSubwayProvider } from "./mbta-subway";
import { mnrProvider } from "./mnr";
import { nyctProvider } from "./nyct";
import { septaBusProvider } from "./septa-bus";
import { shorelineEastProvider } from "./shoreline-east";
import type { TransitProvider } from "./types";
import { vreProvider } from "./vre";
import { wmataProvider } from "./wmata";

/** Every data source the app knows about. Add new providers here. */
export const PROVIDERS: readonly TransitProvider[] =
  process.env.HOPLINE_DEMO === "1"
    ? [demoProvider, demoSubwayProvider, demoFlightsProvider, demoBusProvider]
    : [mnrProvider, mbtaCommuterRailProvider, marcProvider, vreProvider, amtrakProvider, shorelineEastProvider, hartfordLineProvider, nyctProvider, mbtaSubwayProvider, wmataProvider, mbtaBusProvider, septaBusProvider, adsbProvider];

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
  // Modes in the order MODES lists them (trains, metro, flights): the order of the mode tabs and the chooser.
  const modeOrder = (m: Board["mode"]) => Object.keys(MODES).indexOf(m);
  return [...boards.values()].sort((a, b) => modeOrder(a.mode) - modeOrder(b.mode) || a.region.name.localeCompare(b.region.name));
}

export const listBoards = () => deriveBoards(PROVIDERS);

/** Resolve URL segments to a board, or undefined if nothing serves it. */
export function findBoard(modeSlug: string, regionId: string): Board | undefined {
  const mode = getMode(modeSlug);
  return listBoards().find((b) => b.mode === mode && b.region.id === regionId);
}
