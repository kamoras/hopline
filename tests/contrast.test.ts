import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Lighthouse can only audit the light theme, so the dark palette is checked here: every text/background pair
// the UI uses must meet WCAG AA (4.5:1) in both themes.
const css = readFileSync("src/app/globals.css", "utf8");

function tokens(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1]!, m[2]!]));
}
const light = tokens(css.slice(css.indexOf(":root"), css.indexOf("@media")));
const dark = { ...light, ...tokens(css.slice(css.indexOf("@media"), css.indexOf("@theme"))) };

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mix = (fg: string, bg: string, alpha: number) => {
  const [f, b] = [rgb(fg), rgb(bg)];
  return `#${f.map((v, i) => Math.round(v * alpha + b[i]! * (1 - alpha)).toString(16).padStart(2, "0")).join("")}`;
};
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

describe.each([
  ["light", light],
  ["dark", dark],
] as const)("%s palette contrast", (_name, t) => {
  const pairs: [string, string, string][] = [
    ["text", "text", "bg"],
    ["text", "text", "surface"],
    ["muted", "muted", "bg"],
    ["muted", "muted", "surface"],
    ["muted", "muted", "surface-2"],
    ["on-accent", "on-accent", "accent"],
    ["accent", "accent", "surface"],
    ["accent", "accent", "bg"],
    ["ok", "ok", "ok-bg"],
    ["warn", "warn", "warn-bg"],
    ["bad", "bad", "bad-bg"],
    ["idle", "idle", "idle-bg"],
  ];
  it.each(pairs)("%s on its background is at least 4.5:1", (_label, fg, bg) => {
    expect(ratio(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(4.5);
  });

  it("accent text on its 10% tint (the highlighted stop) is at least 4.5:1", () => {
    expect(ratio(t.accent!, mix(t.accent!, t.surface!, 0.1))).toBeGreaterThanOrEqual(4.5);
  });
});
