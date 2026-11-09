import { describe, expect, it } from "vitest";
import { buildCatalog, normalizeUrl, parseCsv, summarize } from "../scripts/lib/catalog";
import catalog from "../catalog/agencies.json";

const header = "id,data_type,entity_type,location.country_code,location.subdivision_name,location.municipality,provider,name,static_reference,urls.direct_download,urls.authentication_type,urls.license,location.bounding_box.minimum_latitude,location.bounding_box.maximum_latitude,location.bounding_box.minimum_longitude,location.bounding_box.maximum_longitude,status";
const box = "40.0,40.5,-75.5,-75.0";
const csv = [
  header,
  `mdb-1,gtfs,,US,Pennsylvania,Reading,"Berks, Area Transit","The ""Bus""",,https://a.example/gtfs.zip,0,CC-BY,${box},active`,
  `mdb-2,gtfs_rt,vp,US,Pennsylvania,Reading,Berks,,mdb-1,https://a.example/vp,0,,,,,,active`,
  `mdb-3,gtfs_rt,tu|vp,US,Pennsylvania,Reading,Berks,,mdb-1,https://a.example/both,0,,,,,,active`,
  `mdb-4,gtfs_rt,sa,US,Pennsylvania,Reading,Berks,,mdb-1,https://a.example/alerts,2,,,,,,active`, // keyed: not used
  `mdb-5,gtfs,,US,Ohio,Columbus,Keyed Transit,,,https://b.example/gtfs.zip,1,,${box},active`, // keyed schedule
  `mdb-6,gtfs,,US,Ohio,Columbus,Hand Built,,,https://www.C.example/g.zip?x=1,0,,${box},active`, // already served by hand
  `mdb-7,gtfs,,CA,Ontario,Toronto,Not Us,,,https://d.example/g.zip,0,,${box},active`,
  `mdb-8,gtfs,,US,Texas,Austin,Bad Box,,,https://e.example/g.zip,0,,0,0,0,0,active`,
  `mdb-9,gtfs,,US,Texas,Dallas,Retired,,,https://f.example/g.zip,0,,${box},deprecated`,
  `mdb-10,gtfs,,US,Texas,Dallas,Huge,,,https://g.example/g.zip,0,,20,45,-120,-80,active`,
].join("\n");

describe("catalog", () => {
  it("reads quoted CSV fields", () => {
    const rows = parseCsv(csv);
    expect(rows[0]!.provider).toBe("Berks, Area Transit");
    expect(rows[0]!.name).toBe('The "Bus"');
    expect(rows).toHaveLength(10);
  });

  it("keeps keyless US schedule feeds with a sensible area, pairing their keyless live feeds", () => {
    const entries = buildCatalog(parseCsv(csv), { handBuilt: new Set([normalizeUrl("https://www.C.example/g.zip?x=1")]) });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      name: 'Berks, Area Transit (The "Bus")',
      state: "Pennsylvania",
      mdbId: "mdb-1",
      staticUrl: "https://a.example/gtfs.zip",
      bbox: [-75.5, 40, -75, 40.5],
      rt: { vehicles: "https://a.example/vp", tripUpdates: "https://a.example/both" }, // the keyed alert feed is left out
    });
    expect(entries[0]!.id).toMatch(/^berks-area-transit-1$/);
  });

  it("leaves out the ids on the skip list", () => {
    expect(buildCatalog(parseCsv(csv), { skip: new Set(["mdb-1"]) }).map((e) => e.mdbId)).toEqual(["mdb-6"]); // mdb-6 is not hand-built here, only mdb-1 is skipped
  });

  it("recognizes a hand-built agency's address however it is spelled", () => {
    expect(normalizeUrl("HTTPS://WWW.Example.com/Feed.zip?token=1#x")).toBe("example.com/feed.zip");
  });

  it("summarizes what it holds", () => {
    const s = summarize(buildCatalog(parseCsv(csv)));
    expect(s).toMatchObject({ agencies: 2, withLive: 1, states: 2 });
  });
});

describe("the committed catalog", () => {
  const agencies = (catalog as { agencies: { id: string; bbox: number[]; staticUrl: string }[] }).agencies;

  it("has unique ids and plausible areas for hundreds of agencies", () => {
    expect(agencies.length).toBeGreaterThan(500);
    expect(new Set(agencies.map((a) => a.id)).size).toBe(agencies.length);
    for (const a of agencies) expect(a.bbox[2]! - a.bbox[0]!).toBeLessThanOrEqual(12);
  });

  it("does not repeat an agency Hopline already serves by hand", () => {
    const urls = new Set(agencies.map((a) => normalizeUrl(a.staticUrl)));
    for (const known of ["cdn.mbta.com/mbta_gtfs.zip", "rrgtfsfeeds.s3.amazonaws.com/gtfsmnr.zip", "content.amtrak.com/content/gtfs/gtfs.zip"]) expect(urls.has(known)).toBe(false);
  });
});

describe("station search index", () => {
  it("finds stations by name on boards that exist, best matches first", async () => {
    const { searchIndex } = await import("../src/server/search-index");
    const places = [
      ["rail", "northeast", "stamford", "Stamford", 41.05, -73.54],
      ["rail", "northeast", "old-stamford", "Old Stamford Road", 41, -73.5],
      ["subway", "gone", "stamford-x", "Stamford X", 41, -73],
      ["ferry", "nyc", "wall", "Wall St", 40.7, -74],
    ] as const;
    const boards = new Set(["rail/northeast", "ferry/nyc"]);
    expect(searchIndex(places, "stamford", boards).map((h) => h.place[2])).toEqual(["stamford", "old-stamford"]);
    expect(searchIndex(places, "  ", boards)).toEqual([]);
    expect(searchIndex(places, "wall", boards)).toHaveLength(1);
  });
});
