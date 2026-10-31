/** Single source of truth for brand values used in JS (icons, social image, metadata). CSS tokens live in app/globals.css. */
export const BRAND = {
  name: "Hopline",
  // Alternatives if this one is ever retired: "Every ride, one pane." · "Where's my ride?"
  tagline: "Know before you go.",
  description:
    "Live trains, metro, buses and flights in one calm place: where everything is right now, what's late, and why. No accounts, no cookies, no ad tracking.",
  /** What the live data covers, for the social card. */
  coverage: "Trains, metro, buses and flights, live.",
  navy: "#12315E",
  accent: "#2B6BEA",
  light: "#9CC0FF",
} as const;
