"use client";

/** The one search box over the map. What it finds opens in a drawer (see SearchDrawer); this only holds the text. */
export function SearchBar({ value, onChange, onFocus, placeholder }: { value: string; onChange(v: string): void; onFocus?(): void; placeholder: string }) {
  return (
    <label className="relative block">
      <span className="sr-only">Search vehicles, stations and airports</span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-2xl border border-line bg-surface/95 px-4 py-3 text-base shadow-card outline-none backdrop-blur placeholder:text-muted focus:border-accent"
      />
    </label>
  );
}
