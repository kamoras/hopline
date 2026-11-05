/**
 * Joins the reports of parallel ingest batches into catalog/ingested.json.
 *
 *   npm run ingest:merge -- part-1.json part-2.json ...
 *
 * Each part is what `npm run ingest -- --batch i/n --part <file>` wrote. The report is replaced whole (the batches together
 * cover the catalog), so an agency that stopped passing drops out of what is served.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mergeReports } from "./lib/ingest.js";

const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (files.length === 0) {
  console.error("usage: npm run ingest:merge -- part-1.json part-2.json ...");
  process.exit(1);
}
const merged = mergeReports(files.map((f) => JSON.parse(readFileSync(f, "utf8")) as { served: { key: string }[]; rejected: { id: string }[] }));
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "catalog", "ingested.json");
writeFileSync(out, JSON.stringify({ checkedOn: new Date().toISOString().slice(0, 10), ...merged }, null, 1) + "\n");
console.log(`Merged ${files.length} parts: ${merged.served.length} served, ${merged.rejected.length} rejected`);
