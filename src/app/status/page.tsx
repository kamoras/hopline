import type { Metadata } from "next";
import Link from "next/link";
import { boardHref } from "@/domain/board";
import { MODES } from "@/domain/modes";
import { listBoards } from "@/providers/registry";
import { getSnapshot } from "@/server/snapshot";

export const metadata: Metadata = { title: "Status", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Live health of every data source: did it respond, how many trips did we keep,
 * and what did we drop and why. Public and free of secrets; it exists so an empty
 * board can be diagnosed in seconds.
 */
export default async function StatusPage() {
  const boards = listBoards();
  const snapshots = await Promise.all(boards.map((b) => getSnapshot(b)));

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <header>
        <Link href="/" className="text-sm text-muted hover:text-text">
          ← Hopline
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Status</h1>
        <p className="mt-1 text-muted">What each data source is returning right now.</p>
      </header>

      {boards.map((board, i) => {
        const snap = snapshots[i]!;
        return (
          <section key={`${board.mode}/${board.region.id}`} className="space-y-3">
            <h2 className="text-lg font-semibold">
              <Link href={boardHref(board.mode, board.region.id)} className="hover:text-accent">
                {MODES[board.mode].label} · {board.region.name}
              </Link>
              <span className="ml-2 text-sm font-normal text-muted">{snap.trips.length} trips shown</span>
            </h2>
            {snap.providers.map((p) => (
              <div key={p.id} className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold">{p.name}</span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${p.ok ? "bg-ok-bg text-ok" : "bg-bad-bg text-bad"}`}>
                    {p.ok ? `OK · ${p.tripCount} trips` : "Failing"}
                  </span>
                </div>
                {p.error && <p className="mt-2 rounded-lg bg-bad-bg px-3 py-2 font-mono text-sm break-words text-bad">{p.error}</p>}
                {p.diagnostics && Object.keys(p.diagnostics).length > 0 && (
                  <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                    {Object.entries(p.diagnostics).map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="text-muted">{k}</dt>
                        <dd className="tabular font-mono break-words">{String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            ))}
          </section>
        );
      })}
    </main>
  );
}
