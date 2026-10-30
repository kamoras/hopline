/** Display names for operator ids. Add an entry when you add a provider. */
const NAMES: Record<string, string> = {
  mnr: "Metro-North",
  amtrak: "Amtrak",
};

export function operatorName(id: string): string {
  return NAMES[id] ?? id;
}
