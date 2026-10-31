"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import type { BoardLink } from "@/domain/board";
import { MODES, type Mode } from "@/domain/modes";
import { BRAND } from "@/brand";
import { Logo } from "../brand/logo";
import { HomeSearch } from "./home-search";
import { ResumeCard } from "./resume-card";
import type { RegionPin } from "./types";

const HomeMap = dynamic(() => import("./home-map"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center bg-surface-2 text-sm text-muted">Loading map…</div>,
});

/**
 * Home when there is more than one board. Three ways in for three kinds of
 * people: search (know where), resume (daily rider), map (exploring).
 */
export function BoardChooser({ boards, pins }: { boards: BoardLink[]; pins: RegionPin[] }) {
  const byMode = Object.groupBy(boards, (b) => b.mode);
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header className="space-y-4">
        <Logo size={40} />
        <div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{BRAND.tagline}</h1>
          <p className="mt-1.5 max-w-xl text-muted">{BRAND.coverage} Pick where you are, and see what is moving.</p>
        </div>
      </header>
      <ResumeCard boards={boards} />
      <HomeSearch />
      <div className="h-72 overflow-hidden rounded-2xl border border-line" aria-label="Map of boards">
        <HomeMap pins={pins} />
      </div>
      <div className="space-y-6">
        {Object.entries(byMode).map(([mode, list]) => (
          <section key={mode} aria-label={MODES[mode as Mode].label}>
            <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">{MODES[mode as Mode].label}</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {list?.map((b) => (
                <li key={b.href}>
                  <Link href={b.href} className="block rounded-2xl border border-line bg-surface p-4 font-semibold hover:border-accent/50">
                    {b.regionName}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
