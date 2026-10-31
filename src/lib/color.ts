/** Black or white, whichever reads better on this background color ("#FFC72C" gets black, "#1A1818" white). */
export function readableTextColor(hex: string): "#000000" | "#FFFFFF" {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "#FFFFFF";
  const channel = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  // Contrast with white is 1.05 / (L + 0.05); with black (L + 0.05) / 0.05. Pick the larger.
  return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.05 ? "#FFFFFF" : "#000000";
}
