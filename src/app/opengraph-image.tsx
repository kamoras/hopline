import { ImageResponse } from "next/og";
import { BRAND } from "@/brand";
import { MarkSvg } from "@/components/brand/mark";

export const alt = `${BRAND.name} — ${BRAND.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Preview card for shared links. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          color: "#fff",
          background: `linear-gradient(135deg, ${BRAND.navy} 0%, #0a1d3a 100%)`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <MarkSvg size={112} />
          <div style={{ fontSize: 84, fontWeight: 700, letterSpacing: -2 }}>{BRAND.name}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05 }}>{BRAND.tagline}</div>
          <div style={{ fontSize: 34, color: BRAND.light }}>{BRAND.coverage}</div>
        </div>
      </div>
    ),
    size,
  );
}
