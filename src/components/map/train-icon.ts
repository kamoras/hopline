import type { Map as MapLibreMap } from "maplibre-gl";

const PREFIX = "train:";
const PLANE_PREFIX = "plane:";
const BUS_PREFIX = "bus:";

/**
 * The sprite id for a train. Features reference it; it is drawn on first use.
 * `solid` trains (problems) are filled with the status color; quiet ones (on time) are white with a
 * colored outline, so they read clearly on a line of the same color without shouting.
 */
export const trainIconId = (color: string, solid: boolean) => `${PREFIX}${solid ? "solid" : "quiet"}:${color}`;

/** The same, for an aircraft: a small airplane silhouette. */
export const planeIconId = (color: string, solid: boolean) => `${PLANE_PREFIX}${solid ? "solid" : "quiet"}:${color}`;

/** The same, for a bus: a boxy, filled body with a row of windows, so it is never mistaken for a train. */
export const busIconId = (color: string, solid: boolean) => `${BUS_PREFIX}${solid ? "solid" : "quiet"}:${color}`;

/** The sprite for a trip of this mode. */
export const vehicleIconId = (mode: string, color: string, solid: boolean) =>
  mode === "flights" ? planeIconId(color, solid) : mode === "bus" ? busIconId(color, solid) : trainIconId(color, solid);

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

/**
 * A small bus pointing right (east): a squared-off body filled with its route's color (a train is a white body with a
 * pointed nose), a row of white windows and a bright windshield at the front.
 */
function drawBus(color: string, solid: boolean): ImageData | undefined {
  const w = 44;
  const h = 24;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  ctx.beginPath();
  ctx.roundRect(3, 4, 38, 16, 4);
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.fillStyle = solid ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.95)";
  for (const x of [8, 16, 24]) ctx.fillRect(x, 8, 5, 6); // side windows
  ctx.fillRect(33, 7, 5, 10); // windshield
  return ctx.getImageData(0, 0, w, h);
}

/** A small airplane pointing right (east): fuselage, swept wings and tailplane, outlined so it reads over any basemap. */
function drawPlane(color: string, solid: boolean): ImageData | undefined {
  const w = 48;
  const h = 40;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  ctx.beginPath();
  ctx.moveTo(44, 20); // nose
  ctx.quadraticCurveTo(42, 17, 34, 17);
  ctx.lineTo(24, 4); // right wing tip (up on screen)
  ctx.lineTo(19, 4);
  ctx.lineTo(24, 17);
  ctx.lineTo(10, 17);
  ctx.lineTo(5, 10); // tailplane
  ctx.lineTo(2, 10);
  ctx.lineTo(5, 20);
  ctx.lineTo(2, 30);
  ctx.lineTo(5, 30);
  ctx.lineTo(10, 23);
  ctx.lineTo(24, 23);
  ctx.lineTo(19, 36);
  ctx.lineTo(24, 36);
  ctx.lineTo(34, 23);
  ctx.quadraticCurveTo(42, 23, 44, 20);
  ctx.closePath();
  ctx.lineJoin = "round";
  ctx.lineWidth = solid ? 3.5 : 4;
  ctx.strokeStyle = solid ? "#ffffff" : color;
  ctx.stroke();
  ctx.fillStyle = solid ? color : "#ffffff";
  ctx.fill();
  return ctx.getImageData(0, 0, w, h);
}

/** Registers a handler that draws a train or plane sprite the first time the map asks for one. */
export function installTrainIcons(map: MapLibreMap) {
  map.on("styleimagemissing", (e) => {
    const plane = e.id.startsWith(PLANE_PREFIX);
    const bus = e.id.startsWith(BUS_PREFIX);
    if ((!plane && !bus && !e.id.startsWith(PREFIX)) || map.hasImage(e.id)) return;
    const [, style, color] = e.id.split(plane ? /^plane:(solid|quiet):/ : bus ? /^bus:(solid|quiet):/ : /^train:(solid|quiet):/);
    const image = style && color ? (plane ? drawPlane : bus ? drawBus : draw)(color, style === "solid") : undefined;
    if (image) map.addImage(e.id, image, { pixelRatio: 2 });
  });
}
