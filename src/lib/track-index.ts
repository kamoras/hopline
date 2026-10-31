import type { LatLon } from "./geo";
import { projectSegment, type Polyline } from "./polyline";

/** Grid cell size in degrees (about 1 km). */
const CELL_DEG = 0.01;
/**
 * Padding in degrees per meter of search radius. Generous on purpose: it must cover the radius in
 * longitude too, where a degree is shorter (about 19 km at 80°N), so a query only reads its own cell.
 */
const PAD_DEG_PER_M = 1 / 20_000;

export interface TrackHit {
  line: Polyline;
  /** Meters along `line` from its start. */
  along: number;
  /** Meters from the point to the line. */
  off: number;
}

/**
 * A grid over every segment of a set of lines, so "which track is this point on" reads a handful of
 * segments instead of every point of every line. Built once per board (the track is static) and shared by
 * every request; a query costs about the same however large the network grows.
 */
export class TrackIndex {
  private readonly cells = new Map<number, number[]>();
  /** Segments are packed as line * SEG_STRIDE + segment, so a cell holds plain numbers. */
  private static readonly SEG_STRIDE = 1 << 24;

  constructor(
    readonly lines: readonly Polyline[],
    private readonly maxMeters: number,
  ) {
    const pad = maxMeters * PAD_DEG_PER_M;
    lines.forEach((line, l) => {
      for (let i = 1; i < line.pts.length; i++) {
        const a = line.pts[i - 1]!;
        const b = line.pts[i]!;
        const [x0, x1] = [Math.floor((Math.min(a.lon, b.lon) - pad) / CELL_DEG), Math.floor((Math.max(a.lon, b.lon) + pad) / CELL_DEG)];
        const [y0, y1] = [Math.floor((Math.min(a.lat, b.lat) - pad) / CELL_DEG), Math.floor((Math.max(a.lat, b.lat) + pad) / CELL_DEG)];
        for (let x = x0; x <= x1; x++) {
          for (let y = y0; y <= y1; y++) {
            const key = cellKey(x, y);
            const cell = this.cells.get(key);
            if (cell) cell.push(l * TrackIndex.SEG_STRIDE + i);
            else this.cells.set(key, [l * TrackIndex.SEG_STRIDE + i]);
          }
        }
      }
    });
  }

  /** Every line (by its position in `lines`) with track within the search radius of the point. */
  nearbyLines(p: LatLon): Set<number> {
    const found = new Set<number>();
    for (const packed of this.cells.get(cellKey(Math.floor(p.lon / CELL_DEG), Math.floor(p.lat / CELL_DEG))) ?? []) {
      const l = Math.floor(packed / TrackIndex.SEG_STRIDE);
      if (!found.has(l) && projectSegment(this.lines[l]!, packed % TrackIndex.SEG_STRIDE, p).offMeters <= this.maxMeters) found.add(l);
    }
    return found;
  }

  /** The closest track within the search radius, or nothing. */
  nearest(p: LatLon): TrackHit | undefined {
    const cell = this.cells.get(cellKey(Math.floor(p.lon / CELL_DEG), Math.floor(p.lat / CELL_DEG)));
    if (!cell) return undefined;
    let best: TrackHit | undefined;
    for (const packed of cell) {
      const line = this.lines[Math.floor(packed / TrackIndex.SEG_STRIDE)]!;
      const hit = projectSegment(line, packed % TrackIndex.SEG_STRIDE, p);
      if (hit.offMeters <= this.maxMeters && (!best || hit.offMeters < best.off)) best = { line, along: hit.along, off: hit.offMeters };
    }
    return best;
  }
}

/** Cell coordinates fit comfortably in 20 bits each (degrees / 0.01 stays under 40,000). */
const cellKey = (x: number, y: number) => (x + 20_000) * 40_000 + (y + 20_000);
