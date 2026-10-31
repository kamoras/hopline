/** Display names for operator ids. Add an entry when you add a provider. */
const NAMES: Record<string, string> = {
  mnr: "Metro-North",
  amtrak: "Amtrak",
  "mbta-cr": "MBTA Commuter Rail",
  adsb: "Flights",
  marc: "MARC Train",
  vre: "VRE",
  "mbta-bus": "MBTA Bus",
  "mta-bus": "NYC Bus",
  "septa-bus": "SEPTA Bus",
  "septa-rail": "SEPTA Regional Rail",
  "wmata-bus": "Metrobus",
  "mbta-subway": "MBTA Subway",
  nyct: "NYC Subway",
  wmata: "Washington Metro",
  "shoreline-east": "Shore Line East",
  "hartford-line": "Hartford Line",
};

export function operatorName(id: string): string {
  return NAMES[id] ?? id;
}
