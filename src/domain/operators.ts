/** Display names for operator ids. Add an entry when you add a provider. */
const NAMES: Record<string, string> = {
  mnr: "Metro-North",
  amtrak: "Amtrak",
  "shoreline-east": "Shore Line East",
  "hartford-line": "Hartford Line",
};

export function operatorName(id: string): string {
  return NAMES[id] ?? id;
}
