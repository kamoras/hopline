"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CatalogHit } from "@/server/catalog";

/** Universal search: boards and stations across every mode and region. */
export function HomeSearch({ floating = false, placeholder = "Where are you? Station, airport, city…" }: { floating?: boolean; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CatalogHit[]>([]);
  const active = q.trim().length >= 2;

  useEffect(() => {
    if (!active) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then(setHits)
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, active]);

  return (
    <div className="relative">
      <label className="block">
        <span className="sr-only">Search stations, airports and boards</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className={`w-full rounded-2xl border border-line bg-surface/95 outline-none backdrop-blur placeholder:text-muted focus:border-accent ${floating ? "px-4 py-3 text-base shadow-card" : "px-4 py-4 text-lg shadow-sm"}`}
        />
      </label>
      {active && (
        <ul className="mt-2 overflow-hidden rounded-2xl border border-line bg-surface shadow-lift">
          {hits.length === 0 ? (
            <li className="px-4 py-3 text-sm text-muted">No matches yet.</li>
          ) : (
            hits.map((h) => (
              <li key={h.href}>
                <Link href={h.href} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2">
                  <span className="font-medium">{h.label}</span>
                  <span className="truncate text-xs text-muted">{h.detail}</span>
                </Link>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
