import type { Mode } from "@/domain/modes";
import { MODES } from "@/domain/modes";

/**
 * What the address of the home app says to open, so a drawer can be shared or reloaded:
 *  - `?trip=mnr:521&board=rail/northeast`   a vehicle (its operator and public number, which outlive a trip id)
 *  - `?place=subway/nyc/times-sq-42-st`     a station or airport
 *  - `?route=bus/boston/39`                 a route of a big network
 * Nothing about the person is in it, only what they were looking at.
 */
export type Link =
  | { kind: "trip"; key: string; mode: Mode; regionId: string }
  | { kind: "place"; mode: Mode; regionId: string; placeId: string }
  | { kind: "route"; mode: Mode; regionId: string; route: string };

const isMode = (m: string | undefined): m is Mode => !!m && m in MODES;

const parseBoard = (value: string | undefined): { mode: Mode; regionId: string; rest: string[] } | undefined => {
  const [mode, regionId, ...rest] = (value ?? "").split("/");
  return isMode(mode) && regionId ? { mode, regionId, rest } : undefined;
};

export function parseLink(params: { trip?: string; board?: string; place?: string; route?: string }): Link | undefined {
  if (params.trip) {
    const board = parseBoard(params.board);
    return board && params.trip.length <= 80 ? { kind: "trip", key: params.trip, mode: board.mode, regionId: board.regionId } : undefined;
  }
  if (params.place) {
    const p = parseBoard(params.place);
    return p && p.rest.length ? { kind: "place", mode: p.mode, regionId: p.regionId, placeId: p.rest.join("/") } : undefined;
  }
  if (params.route) {
    const r = parseBoard(params.route);
    return r && r.rest.length ? { kind: "route", mode: r.mode, regionId: r.regionId, route: r.rest.join("/") } : undefined;
  }
  return undefined;
}

/** The address for what is open ("/" when nothing is). */
export function linkHref(link: Link | undefined): string {
  if (!link) return "/";
  const q = new URLSearchParams();
  if (link.kind === "trip") {
    q.set("trip", link.key);
    q.set("board", `${link.mode}/${link.regionId}`);
  } else if (link.kind === "place") q.set("place", `${link.mode}/${link.regionId}/${link.placeId}`);
  else q.set("route", `${link.mode}/${link.regionId}/${link.route}`);
  // Keep the readable "/" and ":" rather than %2F and %3A.
  return `/?${q.toString().replaceAll("%2F", "/").replaceAll("%3A", ":")}`;
}
