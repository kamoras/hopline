import { describe, expect, it } from "vitest";
import { boardHref } from "@/domain/board";
import { getMode, MODES } from "@/domain/modes";
import { NORTHEAST, type Region } from "@/domain/region";
import { deriveBoards, findBoard, selectProviders } from "@/providers/registry";
import type { TransitProvider } from "@/providers/types";

const provider = (id: string, mode: "rail", regionIds: string[]): TransitProvider => ({
  id, name: id, attribution: { label: id, url: "https://example.com" }, mode, regionIds, fetchTrips: async () => [], fetchPlaces: async () => [],
});

describe("boards", () => {
  it("derives boards from what providers serve, without duplicates", () => {
    const boards = deriveBoards([provider("a", "rail", ["northeast"]), provider("b", "rail", ["northeast"])]);
    expect(boards).toHaveLength(1);
    expect(boards[0]).toMatchObject({ mode: "rail", region: NORTHEAST });
  });

  it("ignores regions that are not defined", () => {
    expect(deriveBoards([provider("a", "rail", ["atlantis"])])).toEqual([]);
  });

  it("only selects providers for the board's own mode and region", () => {
    const other: Region = { ...NORTHEAST, id: "elsewhere" };
    const all = [provider("a", "rail", ["northeast"]), provider("b", "rail", ["elsewhere"])];
    expect(selectProviders(all, { mode: "rail", region: NORTHEAST }).map((p) => p.id)).toEqual(["a"]);
    expect(selectProviders(all, { mode: "rail", region: other }).map((p) => p.id)).toEqual(["b"]);
  });

  it("resolves URL segments and rejects unknown ones", () => {
    expect(findBoard("rail", "northeast")?.region.id).toBe("northeast");
    expect(findBoard("flights", "northeast")).toBeUndefined();
    expect(findBoard("rail", "nowhere")).toBeUndefined();
  });

  it("round-trips mode slugs into hrefs", () => {
    expect(getMode(MODES.rail.slug)).toBe("rail");
    expect(boardHref("rail", "northeast")).toBe("/rail/northeast");
  });
});
