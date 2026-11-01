/**
 * Regenerates every bundled schedule that has a public download, so the timetables never go stale.
 *
 *   npm run data:refresh                 # all of them
 *   npm run data:refresh -- mnr lirr     # just these
 *
 * One source failing (a feed down, a key missing) never stops the others: it is reported and its old data is kept.
 * Exits non-zero only when nothing at all could be refreshed. Sources that need a key are skipped when it is not set.
 * Hartford Line and Shore Line East have no public download (their files are provided by hand), so they are not here.
 */
import { spawnSync } from "node:child_process";

interface Source {
  id: string;
  /** The npm script that rebuilds it. */
  script: string;
  /** An environment variable the download needs. */
  needs?: string;
}

const SOURCES: Source[] = [
  { id: "mnr", script: "data:mnr" },
  { id: "lirr", script: "data:lirr" },
  { id: "subway", script: "data:subway" },
  { id: "amtrak", script: "data:amtrak" },
  { id: "marc", script: "data:marc" },
  { id: "vre", script: "data:vre" },
  { id: "mbta-cr", script: "data:mbta-cr" },
  { id: "mbta-subway", script: "data:mbta-subway" },
  { id: "mbta-bus", script: "data:mbta-bus" },
  { id: "septa-rail", script: "data:septa-rail" },
  { id: "septa-metro", script: "data:septa-metro" },
  { id: "septa-bus", script: "data:septa-bus" },
  { id: "mta-bus", script: "data:mta-bus" },
  { id: "nyc-ferry", script: "data:nyc-ferry" },
  { id: "nyc-sif", script: "data:nyc-sif" },
  { id: "mbta-ferry", script: "data:mbta-ferry" },
  { id: "cttransit", script: "data:cttransit" },
  { id: "norwalk", script: "data:norwalk" },
  { id: "hart", script: "data:hart" },
  { id: "portland-me", script: "data:portland-me" },
  { id: "nywaterway", script: "data:nywaterway" },
  { id: "seastreak", script: "data:seastreak" },
  { id: "statue-ferries", script: "data:statue-ferries" },
  { id: "roosevelt-tram", script: "data:roosevelt-tram" },
  { id: "wmata", script: "data:wmata", needs: "WMATA_API_KEY" },
  { id: "wmata-bus", script: "data:wmata-bus", needs: "WMATA_API_KEY" },
];

const wanted = process.argv.slice(2);
const todo = wanted.length ? SOURCES.filter((s) => wanted.includes(s.id)) : SOURCES;
const ok: string[] = [];
const skipped: string[] = [];
const failed: string[] = [];

for (const source of todo) {
  if (source.needs && !process.env[source.needs]) {
    skipped.push(`${source.id} (${source.needs} is not set)`);
    continue;
  }
  console.log(`\n== ${source.id}`);
  const run = spawnSync("npm", ["run", "--silent", source.script], { stdio: "inherit" });
  (run.status === 0 ? ok : failed).push(source.id);
}

console.log(`\nRefreshed: ${ok.join(", ") || "none"}`);
if (skipped.length) console.log(`Skipped: ${skipped.join("; ")}`);
if (failed.length) console.log(`Failed (old data kept): ${failed.join(", ")}`);
process.exit(ok.length === 0 && todo.length > 0 ? 1 : 0);
