import { describe, expect, it } from "vitest";
import shapes from "../data/amtrak/shapes.json";
import routes from "../data/amtrak/routes.json";

// Every Amtrak train that runs in the Northeast needs a line under it, or it floats free on the map.
const NORTHEAST_TRAINS: Record<string, string> = {
  "88": "Northeast Regional",
  "40751": "Acela",
  "94": "Keystone Service",
  "64": "Pennsylvanian",
  "81": "Lake Shore Limited",
  "61": "Downeaster",
  "68": "Maple Leaf",
  "36949": "Ethan Allen Express",
  "90": "Vermonter",
  "95": "Adirondack",
  "36921": "Empire Service",
  "41044": "Valley Flyer",
  "85": "Carolinian",
  "69": "Palmetto",
};

describe("Amtrak track", () => {
  const drawn = new Set((shapes as { routeId: string }[]).map((s) => s.routeId));

  it("has track for every train that runs in the Northeast", () => {
    for (const [id, name] of Object.entries(NORTHEAST_TRAINS)) expect(drawn.has(id), `${name} (${id}) has no track`).toBe(true);
  });

  it("names them", () => {
    expect(Object.keys(routes as object).length).toBeGreaterThanOrEqual(Object.keys(NORTHEAST_TRAINS).length);
  });
});
