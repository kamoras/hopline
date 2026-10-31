import type { Region } from "@/domain/region";

/**
 * Amtrak station codes served in each region. Used to keep trips that have no
 * GPS fix yet (e.g. awaiting departure) while discarding the rest of the
 * national network. Position-in-bounds covers everything else.
 */
export const REGION_STATION_CODES: Record<string, ReadonlySet<string>> = {
  northeast: new Set([
    // Philadelphia → New York (Northeast Corridor + Keystone)
    "PHL", "NPN", "CWH", "TRE", "PJC", "MET", "NBK", "EWR", "NWK", "NYP", "WIL",
    // New York → Connecticut (Shore Line East corridor, Hartford Line, Empire/Vermonter)
    "NRO", "STM", "BRP", "NHV", "OSB", "NLC", "MYS", "WLY", "KIN", "PVD",
    "WFD", "MDN", "BER", "HFD", "WNL", "SPG", "YNY", "CRT", "POU",
    // Providence → Boston (Northeast Corridor), and the Downeaster / Lake Shore into Boston
    "RTE", "BBY", "BOS", "BON", "FRA", "WOR", "HHL", "WOB",
  ]),
};

export function stationCodesFor(region: Region): ReadonlySet<string> {
  return REGION_STATION_CODES[region.id] ?? new Set();
}
