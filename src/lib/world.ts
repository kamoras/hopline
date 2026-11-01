import type { BoardLink } from "@/domain/board";
import { MODES, type Mode } from "@/domain/modes";
import { formatBbox, snapBbox, type BBox } from "./bbox";

/** What part of the world the model is showing. */
export interface WorldView {
  /** [west, south, east, north] */
  bbox: BBox;
  zoom: number;
}

/**
 * The zoom each mode comes alive at: far enough in that its vehicles read as a model rather than a smear. Trains
 * and planes are sparse, so they run from the start; a city's metro waits for the city; buses wait for the
 * neighborhood (and are fetched only for what is on screen).
 */
export const MODE_MIN_ZOOM: Record<Mode, number> = { rail: 5, flights: 6, subway: 8, ferry: 8, bus: 12 };
/** Stations of a big network are loaded only this close. */
export const STOP_MIN_ZOOM = 14;

const intersects = ([w, s, e, n]: BBox, [w2, s2, e2, n2]: readonly [number, number, number, number]) => w <= e2 && e >= w2 && s <= n2 && n >= s2;

/** One route of a big network the person chose to follow: it is shown whole, at any zoom, and nothing else of that network is. */
export interface RouteFocus {
  board: BoardLink;
  route: string;
}

const sameBoard = (a: Pick<BoardLink, "mode" | "regionId">, b: Pick<BoardLink, "mode" | "regionId">) => a.mode === b.mode && a.regionId === b.regionId;

/** The boards that are in view and close enough to be shown, for the modes that are switched on (and a followed route's board, always). */
export function activeBoards(boards: readonly BoardLink[], view: WorldView | undefined, modes: ReadonlySet<Mode>, focus?: RouteFocus): BoardLink[] {
  if (!view) return [];
  return boards.filter((b) => (focus && sameBoard(b, focus.board)) || (modes.has(b.mode) && view.zoom >= MODE_MIN_ZOOM[b.mode] && intersects(view.bbox, b.bounds)));
}

/** What to ask the server for one active board: its trips, track and stations (a big network by area only). */
export interface BoardRequests {
  board: BoardLink;
  trips: string;
  lines?: string;
  places?: string;
}

export function requestsFor(board: BoardLink, view: WorldView, route?: string): BoardRequests {
  const base = `mode=${board.mode}&region=${board.regionId}`;
  if (route) {
    const r = encodeURIComponent(route);
    return { board, trips: `/api/trips?${base}&route=${r}`, lines: `/api/lines?${base}&route=${r}` };
  }
  if (!MODES[board.mode].viewport) {
    return { board, trips: `/api/trips?${base}`, lines: `/api/lines?${base}`, places: `/api/places?${base}` };
  }
  // A big network is asked about the visible area, rounded outward so panning reuses cached requests.
  const box = formatBbox(snapBbox(view.bbox));
  return { board, trips: `/api/trips?${base}&bbox=${box}`, places: view.zoom >= STOP_MIN_ZOOM ? `/api/places?${base}&bbox=${box}` : undefined };
}

/** A station's id on the combined map, which holds every board's stations: the board key keeps equal ids apart. */
export { sameBoard };

export const worldPlaceId = (board: Pick<BoardLink, "mode" | "regionId">, placeId: string) => `${board.mode}~${board.regionId}~${placeId}`;

export function parseWorldPlaceId(id: string): { mode: Mode; regionId: string; placeId: string } | undefined {
  const [mode, regionId, ...rest] = id.split("~");
  return mode && regionId && rest.length ? { mode: mode as Mode, regionId, placeId: rest.join("~") } : undefined;
}

/** A rectangle that holds every board, for the first view. */
export function boundsOfBoards(boards: readonly BoardLink[]): BBox {
  const all = boards.map((b) => b.bounds);
  return [Math.min(...all.map((b) => b[0])), Math.min(...all.map((b) => b[1])), Math.max(...all.map((b) => b[2])), Math.max(...all.map((b) => b[3]))];
}
