import { ImageResponse } from "next/og";
import { MarkSvg } from "@/components/brand/mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** The home-screen icon on iOS: the mark, full bleed (iOS rounds the corners itself). */
export default function AppleIcon() {
  return new ImageResponse(<MarkSvg size={180} rounded={false} />, size);
}
