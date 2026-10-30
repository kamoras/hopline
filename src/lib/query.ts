import { normalizeName } from "@/domain/place";

/** Extra names for a place, per region: "new york" also means Grand Central or Penn Station. */
export type Aliases = Readonly<Record<string, readonly string[]>>;

/** One direction of travel, as normalized place terms (what the rider typed). */
export interface Route {
  from: string;
  to: string;
}

export const routeKey = (r: Route) => `${r.from} to ${r.to}`;

export interface Intent {
  /** Zero legs: not a journey. One leg: A to B. Two legs: round trip (A to B, then B to A). */
  legs: Route[];
  roundTrip: boolean;
  /** Only departures within this many minutes ("right now", "next hour"). */
  soonMinutes?: number;
  /** Everything left once the structure is recognized: a station, train number or line name. */
  rest: string;
}

const DEFAULT_SOON_MIN = 60;

const ROUND_TRIP = /\b(round ?trip|there and back|and back|both ways|return trip|returning|return)\b/g;
const SOON_WITHIN = /\b(?:in|within) (?:the )?next (\d+) ?(min(?:ute)?s?|hours?|hrs?|h)\b/;
const SOON = /\b(right now|leaving now|departing now|leaves now|now|asap|soon|shortly|next|upcoming)\b/g;
/** Words that carry no meaning for matching. "to" is kept: it separates the two places. */
const FILLER =
  /\b(please|show|find|get|give|me|the|a|an|any|all|trains?|trips?|leaving|leaves|leave|departing|departs|depart|departures?|going|goes|go|heading|headed|travel(?:l?ing)?|schedules?|times?|from|between|and)\b/g;

/**
 * Understands plain-language queries such as
 *   "new haven to new york round trip"
 *   "trains leaving new haven to new york right now"
 *   "stamford → grand central"
 * into structure; anything unrecognized stays in `rest` for ordinary search.
 */
export function parseIntent(query: string): Intent {
  let s = ` ${query.toLowerCase().replace(/[’']/g, "").replace(/→|=>|->|>/g, " to ")} `;

  const roundTrip = ROUND_TRIP.test(s);
  s = s.replace(ROUND_TRIP, " ");

  let soonMinutes: number | undefined;
  const within = s.match(SOON_WITHIN);
  if (within) {
    soonMinutes = Number(within[1]) * (/^h/.test(within[2]!) ? 60 : 1);
    s = s.replace(SOON_WITHIN, " ");
  }
  if (SOON.test(s)) soonMinutes ??= DEFAULT_SOON_MIN;
  s = s.replace(SOON, " ");

  s = normalizeName(s.replace(FILLER, " "));

  const m = s.match(/^(.+?) to (.+)$/);
  const from = normalizeName(m?.[1] ?? "");
  const to = normalizeName(m?.[2] ?? "");
  if (from && to) {
    const out: Route = { from, to };
    return { legs: roundTrip ? [out, { from: to, to: from }] : [out], roundTrip, soonMinutes, rest: s };
  }
  return { legs: [], roundTrip: false, soonMinutes, rest: s };
}

/** The terms a rider's word stands for: the word itself plus any region aliases. */
export function expandTerm(term: string, aliases: Aliases = {}): string[] {
  return [term, ...(aliases[term] ?? [])];
}

export const nameMatches = (stopName: string, terms: readonly string[]) => {
  const n = normalizeName(stopName);
  return terms.some((t) => n.includes(t));
};

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

export const describeLeg = (r: Route) => `${titleCase(r.from)} → ${titleCase(r.to)}`;

/** "New Haven → New York · round trip · next hour": echoes back what we understood. */
export function describeIntent(i: Intent): string | undefined {
  if (i.legs.length === 0 && !i.soonMinutes) return undefined;
  const parts: string[] = [];
  if (i.legs[0]) parts.push(describeLeg(i.legs[0]));
  else if (i.rest) parts.push(titleCase(i.rest));
  if (i.roundTrip) parts.push("round trip");
  if (i.soonMinutes) parts.push(i.soonMinutes >= 60 && i.soonMinutes % 60 === 0 ? `next ${i.soonMinutes / 60} hr` : `next ${i.soonMinutes} min`);
  return parts.join(" · ");
}
