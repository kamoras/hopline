import { NORTHEAST_AIR } from "@/domain/region";
import { adsbProvider } from "../adsb";
import { NORTHEAST_AIRPORTS } from "../adsb/airports";
import { buildAirportStatus } from "../adsb/faa";
import { buildFlightArrivals, buildFlights, type Aircraft } from "../adsb/normalize";
import type { TransitProvider } from "../types";

/**
 * Offline demo flights (`HOPLINE_DEMO=1`): aircraft flown on fixed approach and climb-out paths around each
 * airport, fed through the *real* normalizer, so the UI exercises the same code as production.
 */
const CYCLE_MS = 20 * 60_000;
const BEARINGS = [20, 110, 200, 290];
const NM_LAT = 1 / 60;

function synthetic(now: number): Aircraft[] {
  const out: Aircraft[] = [];
  NORTHEAST_AIRPORTS.forEach((airport, a) => {
    BEARINGS.forEach((bearing, b) => {
      const phase = ((now + (a * 4 + b) * 97_000) % CYCLE_MS) / CYCLE_MS; // 0..1 around the cycle
      const rad = (bearing * Math.PI) / 180;
      const position = (nm: number) => ({
        lat: airport.lat + Math.cos(rad) * nm * NM_LAT,
        lon: airport.lon + (Math.sin(rad) * nm * NM_LAT) / Math.cos((airport.lat * Math.PI) / 180),
      });
      const id = `${a}${b}`;
      if (b % 2 === 0) {
        // Inbound: 55 nm out down to the runway, descending, heading for the airport.
        const nm = 55 * (1 - phase);
        out.push({ hex: `in${id}`, flight: `${["DAL", "UAL", "AAL", "JBU", "SWA"][(a + b) % 5]}${100 + a * 7 + b}`, t: "A320", ...position(nm), gs: 180, track: (bearing + 180) % 360, alt_baro: Math.round(350 * nm + 800), baro_rate: -700, seen_pos: 0.5 });
      } else {
        // Outbound: climbing away from the airport.
        const nm = 3 + 40 * phase;
        out.push({ hex: `out${id}`, flight: `${["RPA", "ENY", "SKW"][(a + b) % 3]}${300 + a * 5 + b}`, t: "E75L", ...position(nm), gs: 250, track: bearing, alt_baro: Math.round(1500 + 250 * nm), baro_rate: 1800, seen_pos: 0.5 });
      }
    });
  });
  // A couple of high flyers crossing the region.
  for (let i = 0; i < 3; i++) {
    const t = ((now + i * 400_000) % (30 * 60_000)) / (30 * 60_000);
    out.push({ hex: `cruise${i}`, flight: `FDX${900 + i}`, t: "B763", lat: 39.6 + i * 0.7, lon: -76 + t * 4, gs: 450, track: 90, alt_baro: 36000, baro_rate: 0, seen_pos: 0.5 });
  }
  return out;
}

const DEMO_FAA = `<AIRPORT_STATUS_INFORMATION>
  <Delay_type><Name>General Arrival/Departure Delay Info</Name><Arrival_Departure_Delay_List>
    <Delay><ARPT>LGA</ARPT><Reason>WEATHER:Thunderstorms</Reason><Arrival_Departure Type="Departure"><Min>30 minutes</Min><Max>44 minutes</Max><Trend>Increasing</Trend></Arrival_Departure></Delay>
  </Arrival_Departure_Delay_List></Delay_type>
  <Delay_type><Name>Ground Stop Programs</Name><Ground_Stop_List>
    <Program><ARPT>EWR</ARPT><Reason>WEATHER:Thunderstorms</Reason><End_Time>8:30 pm EDT</End_Time></Program>
  </Ground_Stop_List></Delay_type>
</AIRPORT_STATUS_INFORMATION>`;

export const demoFlightsProvider: TransitProvider = {
  ...adsbProvider,
  async fetchTrips({ now, region, diag }) {
    return buildFlights({ aircraft: synthetic(now), airports: NORTHEAST_AIRPORTS, region: region ?? NORTHEAST_AIR, now, diag });
  },
  async fetchArrivals({ now, region }, place) {
    return buildFlightArrivals({ aircraft: synthetic(now), airports: NORTHEAST_AIRPORTS, region: region ?? NORTHEAST_AIR, now, airport: place.codes?.[0] ?? "" });
  },
  async fetchLineStatus() {
    return buildAirportStatus(DEMO_FAA, NORTHEAST_AIRPORTS);
  },
};
