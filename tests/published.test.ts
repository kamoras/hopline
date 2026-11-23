import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generatedIds, isServed, publishedKeys, resetPublished } from "@/providers/generated/published";

describe("which generated agencies are shown", () => {
  afterEach(() => {
    resetPublished();
    delete process.env.HOPLINE_DATA_URL;
    generatedIds.clear();
  });

  it("always shows hand-built providers, and shows everything until the host has answered", () => {
    generatedIds.add("gen-a");
    expect(isServed("mnr", new Set())).toBe(true);
    expect(isServed("gen-a", undefined)).toBe(true);
    expect(isServed("gen-a", new Set(["gen-a"]))).toBe(true);
    expect(isServed("gen-a", new Set(["gen-b"]))).toBe(false);
  });

  it("learns what the host has from its index, without blocking", async () => {
    const dir = mkdtempSync(join(tmpdir(), "published-"));
    writeFileSync(join(dir, "index.json"), JSON.stringify({ agencies: [{ id: "gen-a" }] }));
    process.env.HOPLINE_DATA_URL = `file://${dir}`;
    expect(publishedKeys()).toBeUndefined(); // the first call only starts the fetch
    await new Promise((r) => setTimeout(r, 100));
    expect([...publishedKeys()!]).toEqual(["gen-a"]);
  });

  it("knows nothing without a host", () => {
    expect(publishedKeys()).toBeUndefined();
  });
});
