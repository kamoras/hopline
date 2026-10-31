import { ImageResponse } from "next/og";
import { MarkSvg } from "@/components/brand/mark";

export const contentType = "image/png";

const SIZES = [32, 192, 512];

export function generateImageMetadata() {
  return SIZES.map((s) => ({ id: String(s), size: { width: s, height: s }, contentType }));
}

/** Favicon and PWA icons, drawn from the same mark as the header logo. */
export default async function Icon({ id }: { id: Promise<string | number> }) {
  const size = Number(await id);
  return new ImageResponse(<MarkSvg size={size} />, { width: size, height: size });
}
