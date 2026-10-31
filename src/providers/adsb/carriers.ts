/** Airline names by the three-letter prefix of a flight's callsign ("DAL1283" is Delta). */
const CARRIERS: Record<string, string> = {
  AAL: "American", DAL: "Delta", UAL: "United", SWA: "Southwest", JBU: "JetBlue", NKS: "Spirit", FFT: "Frontier",
  ASA: "Alaska", HAL: "Hawaiian", AAY: "Allegiant", SKW: "SkyWest", RPA: "Republic", ENY: "Envoy", EDV: "Endeavor",
  GJS: "GoJet", JIA: "PSA", PDT: "Piedmont", ASH: "Mesa", CPZ: "Compass", QXE: "Horizon", SCX: "Sun Country",
  FDX: "FedEx", UPS: "UPS", ABX: "ABX Air", GTI: "Atlas Air", PAC: "Polar Air", KAL: "Korean Air Cargo", CLX: "Cargolux",
  ACA: "Air Canada", WJA: "WestJet", JZA: "Jazz", POE: "Porter", BAW: "British Airways", VIR: "Virgin Atlantic",
  DLH: "Lufthansa", AFR: "Air France", KLM: "KLM", EIN: "Aer Lingus", ICE: "Icelandair", UAE: "Emirates", QTR: "Qatar",
  THY: "Turkish", SWR: "Swiss", IBE: "Iberia", TAP: "TAP Portugal", AMX: "Aeromexico", CMP: "Copa", AVA: "Avianca",
  ELY: "El Al", SAS: "SAS", FIN: "Finnair", NOZ: "Norwegian", AIC: "Air India", ETD: "Etihad", SIA: "Singapore", ANA: "ANA",
  JAL: "Japan Airlines", CPA: "Cathay Pacific", KOR: "Korean Air", EJA: "NetJets", LXJ: "Flexjet", VJA: "Vista",
};

/** "DAL1283" -> { carrier: "Delta", code: "DAL" }; an unknown prefix is shown as it is. */
export function carrierOf(callsign: string): { code: string; name: string } {
  const code = callsign.slice(0, 3);
  return { code, name: CARRIERS[code] ?? code };
}
