"use client";

import { useState } from "react";
import { normalizeName, type Place } from "@/domain/place";
import { parseIntent } from "@/lib/query";

interface Props {
  value: string;
  onChange(value: string): void;
  placeholder: string;
  label: string;
  places: readonly Place[];
  onPickPlace(id: string): void;
}

/**
 * Search input with station autocomplete. Typing "stamford" suggests the
 * station; "stamford to grand central" is treated as a route, so no suggestions.
 */
export function SearchBox({ value, onChange, placeholder, label, places, onPickPlace }: Props) {
  const [focused, setFocused] = useState(false);
  const q = normalizeName(value);
  const suggestions =
    focused && q.length >= 2 && !/^\d+$/.test(q) && parseIntent(value).legs.length === 0
      ? places
          .filter((p) => normalizeName(p.name).includes(q))
          .sort((a, b) => Number(!normalizeName(a.name).startsWith(q)) - Number(!normalizeName(b.name).startsWith(q)))
          .slice(0, 5)
      : [];

  return (
    <div className="relative">
      <label className="block">
        <span className="sr-only">{label}</span>
        <input
          type="search"
          inputMode="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full rounded-2xl border border-line bg-surface px-4 py-3.5 text-lg shadow-sm outline-none placeholder:text-muted focus:border-accent"
        />
      </label>
      {suggestions.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-2xl border border-line bg-surface shadow-xl" role="listbox">
          {suggestions.map((p) => (
            <li key={p.id} role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange("");
                  onPickPlace(p.id);
                }}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-surface-2"
              >
                <span className="font-medium">{p.name}</span>
                <span className="text-xs text-muted">Departures →</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
