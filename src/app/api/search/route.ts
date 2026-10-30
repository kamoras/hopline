import { searchCatalog } from "@/server/catalog";

export const dynamic = "force-dynamic";

/** GET /api/search?q=stam: universal search over boards and places. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const hits = await searchCatalog(q.slice(0, 80));
  return Response.json(hits, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
}
