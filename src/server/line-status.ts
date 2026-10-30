import type { Board } from "@/domain/board";
import type { LineStatus } from "@/domain/line-status";
import { providersFor } from "@/providers/registry";

/**
 * How each line is running. Unlike trips, a failure here is surfaced (the route returns an error) rather than
 * swallowed: "status unavailable" and "good service" must never look the same.
 */
export async function getLineStatus(board: Board, now = Date.now()): Promise<LineStatus[]> {
  const lists = await Promise.all(
    providersFor(board).map((p) => p.fetchLineStatus?.({ region: board.region, now, diag: {}, signal: AbortSignal.timeout(8_000) }) ?? []),
  );
  return lists.flat();
}
