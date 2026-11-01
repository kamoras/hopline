import { createBudget, TRAFFIC_CACHE_S, upstreamTileUrl, validTile } from "@/lib/traffic";

export const dynamic = "force-dynamic";

/** TomTom's free tier is about 50,000 tile requests a day; stay well under it (per instance, on top of the edge cache). */
const budget = createBudget(Number(process.env.TRAFFIC_DAILY_BUDGET) || 30_000);

type Params = Promise<{ z: string; x: string; y: string }>;

/**
 * GET /api/traffic/{z}/{x}/{y}: one tile of road congestion, fetched from TomTom with the server's key and cached for a
 * minute at the edge (traffic is the same for everyone). The key never reaches the browser, and TomTom never sees the viewer.
 */
export async function GET(_request: Request, { params }: { params: Params }) {
  const key = process.env.TOMTOM_API_KEY;
  if (!key) return new Response(null, { status: 404 });
  const { z, x, y } = await params;
  const [zn, xn, yn] = [Number(z), Number(x), Number(y)];
  if (!validTile(zn, xn, yn)) return new Response(null, { status: 400 });
  if (!budget.take()) return new Response(null, { status: 429 }); // today's allowance is spent: no traffic until tomorrow, never a bill
  try {
    const res = await fetch(upstreamTileUrl(key, zn, xn, yn), { signal: AbortSignal.timeout(6_000) });
    // A failure names only the status: the upstream address carries the key and never goes in a response.
    if (!res.ok) return new Response(null, { status: res.status === 429 ? 429 : 502 });
    return new Response(await res.arrayBuffer(), {
      headers: { "Content-Type": res.headers.get("content-type") ?? "image/png", "Cache-Control": `public, s-maxage=${TRAFFIC_CACHE_S}, stale-while-revalidate=${TRAFFIC_CACHE_S}` },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
