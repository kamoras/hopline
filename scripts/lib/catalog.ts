/**
 * Turns the Mobility Database's public catalog (a CSV of every transit feed it knows) into Hopline's candidate agencies:
 * the US agencies with a keyless schedule feed, each paired with its keyless real-time feeds where they exist. Pure, so it is
 * tested on a small sample; `scripts/build-catalog.ts` does the downloading and writing.
 */

export interface CatalogEntry {
  /** Stable id: the provider's name plus the catalog's own number. */
  id: string;
  name: string;
  state: string;
  municipality: string;
  mdbId: string;
  /** The schedule (static GTFS zip). */
  staticUrl: string;
  license?: string;
  /** Where the agency serves: [west, south, east, north]. */
  bbox: [number, number, number, number];
  /** Keyless live feeds, if any (a combined feed fills both `tripUpdates` and `vehicles`). */
  rt?: { tripUpdates?: string; vehicles?: string; alerts?: string };
}

export type Row = Record<string, string>;

/** CSV with quoted fields (commas and doubled quotes inside quotes), as the catalog is written. */
export function parseCsv(text: string): Row[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) rows.push([...row, field]);
  const [header = [], ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

/** The address with the parts that vary between spellings removed, so a hand-built agency's URL matches the catalog's. */
export const normalizeUrl = (url: string) => url.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[?#].*$/, "").replace(/\/$/, "");

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

const keyless = (r: Row) => (r["urls.authentication_type"] ?? "") === "" || r["urls.authentication_type"] === "0";
const live = (r: Row) => (r.status ?? "") === "" || r.status === "active";
/** A bounding box that is a plausible service area (a bad one spans half the planet). */
const MAX_SPAN_DEG = 12;

export interface BuildOptions {
  /** Static feed URLs already served by hand-built providers (normalized), so they are not added twice. */
  handBuilt?: ReadonlySet<string>;
  country?: string;
}

export function buildCatalog(rows: readonly Row[], { handBuilt = new Set<string>(), country = "US" }: BuildOptions = {}): CatalogEntry[] {
  const inCountry = rows.filter((r) => r["location.country_code"] === country && live(r));
  const rtByStatic = new Map<string, Row[]>();
  for (const r of inCountry) {
    if (r.data_type !== "gtfs_rt" || !keyless(r) || !r["urls.direct_download"]) continue;
    for (const ref of (r.static_reference ?? "").split(/\s+/).filter(Boolean)) rtByStatic.set(ref, [...(rtByStatic.get(ref) ?? []), r]);
  }
  const entries: CatalogEntry[] = [];
  const seenUrls = new Set<string>();
  for (const r of inCountry) {
    if (r.data_type !== "gtfs" || !keyless(r) || !r["urls.direct_download"]) continue;
    const url = r["urls.direct_download"]!;
    const key = normalizeUrl(url);
    if (handBuilt.has(key) || seenUrls.has(key)) continue;
    const bbox = ["minimum_longitude", "minimum_latitude", "maximum_longitude", "maximum_latitude"].map((k) => Number(r[`location.bounding_box.${k}`]));
    const [w, s, e, n] = bbox as [number, number, number, number];
    if (bbox.some((v) => !Number.isFinite(v) || v === 0) || e <= w || n <= s || e - w > MAX_SPAN_DEG || n - s > MAX_SPAN_DEG) continue;
    seenUrls.add(key);

    const rt: NonNullable<CatalogEntry["rt"]> = {};
    for (const f of rtByStatic.get(r.id!) ?? []) {
      const types = (f.entity_type ?? "").split("|");
      const at = f["urls.direct_download"]!;
      if (types.includes("tu")) rt.tripUpdates ??= at;
      if (types.includes("vp")) rt.vehicles ??= at;
      if (types.includes("sa")) rt.alerts ??= at;
    }
    const provider = r.provider || r.name || r.id!;
    entries.push({
      id: `${slug(provider)}-${r.id!.replace(/^mdb-/, "")}`,
      name: r.name && r.name !== provider ? `${provider} (${r.name})` : provider,
      state: r["location.subdivision_name"] ?? "",
      municipality: r["location.municipality"] ?? "",
      mdbId: r.id!,
      staticUrl: url,
      ...(r["urls.license"] ? { license: r["urls.license"] } : {}),
      bbox: [w, s, e, n].map((v) => Math.round(v * 1e3) / 1e3) as CatalogEntry["bbox"],
      ...(rt.vehicles || rt.tripUpdates || rt.alerts ? { rt } : {}),
    });
  }
  return entries.sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name));
}

/** What the catalog holds, for the report. */
export function summarize(entries: readonly CatalogEntry[]) {
  const byState = new Map<string, number>();
  for (const e of entries) byState.set(e.state, (byState.get(e.state) ?? 0) + 1);
  return { agencies: entries.length, withLive: entries.filter((e) => e.rt?.vehicles).length, states: byState.size, byState: [...byState].sort((a, b) => b[1] - a[1]) };
}
