import type { Map as MapLibreMap } from "maplibre-gl";

const PREFIX = "train:";

/**
 * The sprite id for a train. Features reference it; it is drawn on first use.
 * `solid` trains (problems) are filled with the status color; quiet ones (on time) are white with a
 * colored outline, so they read clearly on a line of the same color without shouting.
 */
export const trainIconId = (color: string, solid: boolean) => `${PREFIX}${solid ? "solid" : "quiet"}:${color}`;

/**
 * A small train glyph pointing right (east): a rounded body with a pointed nose and a white outline so it
 * reads clearly on top of a line. Rotated at draw time to face the direction of travel.
 */
function draw(color: string, solid: boolean): ImageData | undefined {
  const w = 48;
  const h = 28;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  ctx.beginPath();
  ctx.moveTo(11, 5);
  ctx.lineTo(32, 5);
  ctx.quadraticCurveTo(44, 8, 45, 14);
  ctx.quadraticCurveTo(44, 20, 32, 23);
  ctx.lineTo(11, 23);
  ctx.quadraticCurveTo(4, 23, 4, 14);
  ctx.quadraticCurveTo(4, 5, 11, 5);
  ctx.closePath();
  ctx.lineJoin = "round";
  ctx.lineWidth = solid ? 3.5 : 4;
  ctx.strokeStyle = solid ? "#ffffff" : color;
  ctx.stroke();
  ctx.fillStyle = solid ? color : "#ffffff";
  ctx.fill();
  ctx.fillStyle = solid ? "rgba(255,255,255,0.85)" : color; // headlight, so direction reads at a glance
  ctx.beginPath();
  ctx.arc(37, 14, 2.6, 0, Math.PI * 2);
  ctx.fill();
  return ctx.getImageData(0, 0, w, h);
}

/** Registers a handler that draws a train sprite the first time the map asks for one. */
export function installTrainIcons(map: MapLibreMap) {
  map.on("styleimagemissing", (e) => {
    if (!e.id.startsWith(PREFIX) || map.hasImage(e.id)) return;
    const [, style, color] = e.id.split(/^train:(solid|quiet):/);
    const image = style && color ? draw(color, style === "solid") : undefined;
    if (image) map.addImage(e.id, image, { pixelRatio: 2 });
  });
}
