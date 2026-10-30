import type { Board } from "@/domain/board";
import type { Line } from "@/domain/line";
import { providersFor } from "@/providers/registry";

/** Track geometry from every provider that has it. Providers without geometry simply contribute none. */
export async function getLines(board: Board, now = Date.now()): Promise<Line[]> {
  const lists = await Promise.all(
    providersFor(board).map((p) =>
      p.fetchLines?.({ region: board.region, now, diag: {}, signal: AbortSignal.timeout(8_000) }).catch(() => []) ?? [],
    ),
  );
  return lists.flat();
}
