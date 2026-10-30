import { z } from "zod";

/**
 * Shape of https://api-v3.amtraker.com/v3/trains. Upstream is a community API
 * we don't control, so every field is lenient and parsed per-train: one odd
 * record is skipped instead of failing the whole feed.
 */
const str = z.string().catch("");

export const AmtrakStationSchema = z.object({
  name: str,
  code: str,
  schArr: str,
  schDep: str,
  arr: str,
  dep: str,
  status: str,
  platform: str,
});

export const AmtrakTrainSchema = z.object({
  routeName: str,
  trainNum: z.union([z.string(), z.number()]).catch(""),
  trainNumRaw: z.union([z.string(), z.number()]).optional().catch(undefined),
  trainID: str,
  lat: z.number().catch(0),
  lon: z.number().catch(0),
  iconColor: str,
  stations: z.array(AmtrakStationSchema).catch([]),
  heading: str,
  origCode: str,
  origName: str,
  destCode: str,
  destName: str,
  trainState: str,
  velocity: z.number().catch(0),
  statusMsg: str,
  updatedAt: str,
  lastValTS: str,
  alerts: z.array(z.object({ message: str })).catch([]),
});

/** One entry of https://api-v3.amtraker.com/v3/stations. */
export const AmtrakStationMetaSchema = z.object({
  name: z.string().min(1),
  code: str,
  lat: z.number(),
  lon: z.number(),
});

export type AmtrakTrain = z.infer<typeof AmtrakTrainSchema>;
export type AmtrakStation = z.infer<typeof AmtrakStationSchema>;
