import type { LineAlert, LineState, LineStatus } from "@/domain/line-status";
import { LINE_STATE_RANK } from "@/domain/line-status";
import type { Airport } from "./airports";

/** The FAA's public airport status feed: delays, ground stops and closures. */
export const FAA_STATUS_URL = "https://nasstatus.faa.gov/api/airport-status-information";

const MAX_ALERTS = 4;
const COLOR = "#3b5b92";
const TEXT = "#FFFFFF";

const tag = (block: string, name: string) => block.match(new RegExp(`<${name}[^>]*>([^<]*)</${name}>`))?.[1]?.trim();
const blocks = (xml: string, name: string) => [...xml.matchAll(new RegExp(`<${name}>[\\s\\S]*?</${name}>`, "g"))].map((m) => m[0]);

/** "STAFF:Staffing" -> "staffing"; "WEATHER:Thunderstorms" -> "thunderstorms". */
const reasonText = (raw: string | undefined) => (raw ? raw.split(":").pop()!.trim().toLowerCase() : undefined);

interface Finding {
  airport: string;
  state: LineState;
  alert: LineAlert;
}

/** Everything the FAA says is wrong at any airport, as one finding per program. */
export function parseAirportStatus(xml: string): Finding[] {
  const found: Finding[] = [];
  const add = (block: string, state: LineState, headline: string) => {
    const airport = tag(block, "ARPT");
    if (airport) found.push({ airport, state, alert: { headline, state } });
  };

  for (const b of blocks(xml, "Ground_Stop")) {
    const why = reasonText(tag(b, "Reason"));
    add(b, "suspended", `Ground stop${why ? `: ${why}` : ""}${tag(b, "End_Time") ? `, until ${tag(b, "End_Time")}` : ""}`);
  }
  for (const b of blocks(xml, "Program")) {
    // Ground stops are listed as <Program> inside <Ground_Stop_List>.
    const why = reasonText(tag(b, "Reason"));
    add(b, "suspended", `Ground stop${why ? `: ${why}` : ""}${tag(b, "End_Time") ? `, until ${tag(b, "End_Time")}` : ""}`);
  }
  for (const b of blocks(xml, "Ground_Delay")) {
    const why = reasonText(tag(b, "Reason"));
    add(b, "delays", `Ground delay program: flights held ${tag(b, "Avg") ?? "some time"} on average${why ? `, ${why}` : ""}`);
  }
  for (const b of blocks(xml, "Delay")) {
    const why = reasonText(tag(b, "Reason"));
    const kind = b.match(/<Arrival_Departure Type="([^"]+)"/)?.[1]?.toLowerCase() ?? "arrival/departure";
    const min = tag(b, "Min");
    const max = tag(b, "Max");
    const trend = tag(b, "Trend")?.toLowerCase();
    add(b, "delays", `${kind[0]!.toUpperCase()}${kind.slice(1)} delays${min ? ` of ${min}${max ? ` to ${max}` : ""}` : ""}${trend ? ` (${trend})` : ""}${why ? `, ${why}` : ""}`);
  }
  for (const b of blocks(xml, "Airport")) {
    const why = tag(b, "Reason");
    add(b, "suspended", `Airport closed${tag(b, "Reopen") ? `, reopens ${tag(b, "Reopen")}` : ""}${why && !why.startsWith("!") ? `: ${why}` : ""}`);
  }
  return found;
}

/**
 * How each covered airport is running, from the FAA's status feed. Airports with nothing reported are "good";
 * the system is the "lines" of a flights board, so the same status strip and sheet apply.
 */
export function buildAirportStatus(xml: string, airports: readonly Airport[]): LineStatus[] {
  const findings = parseAirportStatus(xml);
  return airports.map((a) => {
    const mine = findings.filter((f) => f.airport === a.code);
    const alerts = [...new Map(mine.map((f) => [f.alert.headline, f.alert])).values()]
      .sort((x, y) => LINE_STATE_RANK[y.state] - LINE_STATE_RANK[x.state])
      .slice(0, MAX_ALERTS);
    return { route: a.code, color: COLOR, textColor: TEXT, state: alerts[0]?.state ?? "good", alerts };
  });
}
