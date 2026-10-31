const RAD = Math.PI / 180;

/**
 * The sun's height above the horizon in degrees (negative at night) at a place and time, from the NOAA solar
 * position equations. Good to well under a degree, which is plenty for tinting a map at dusk.
 */
export function sunAltitudeDeg(lat: number, lon: number, at: Date): number {
  const jd = at.getTime() / 86_400_000 + 2440587.5; // Julian day
  const t = (jd - 2451545) / 36525; // Julian centuries since J2000
  const meanLong = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const meanAnomaly = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const center =
    Math.sin(meanAnomaly * RAD) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * meanAnomaly * RAD) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * meanAnomaly * RAD) * 0.000289;
  const apparentLong = meanLong + center - 0.00569 - 0.00478 * Math.sin((125.04 - 1934.136 * t) * RAD);
  const obliquity = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60 + 0.00256 * Math.cos((125.04 - 1934.136 * t) * RAD);
  const declination = Math.asin(Math.sin(obliquity * RAD) * Math.sin(apparentLong * RAD));

  const y = Math.tan((obliquity * RAD) / 2) ** 2;
  const equationOfTime =
    4 *
    (y * Math.sin(2 * meanLong * RAD) - 2 * eccentricity * Math.sin(meanAnomaly * RAD) + 4 * eccentricity * y * Math.sin(meanAnomaly * RAD) * Math.cos(2 * meanLong * RAD) - 0.5 * y * y * Math.sin(4 * meanLong * RAD) - 1.25 * eccentricity * eccentricity * Math.sin(2 * meanAnomaly * RAD)) /
    RAD;

  const utcMinutes = at.getUTCHours() * 60 + at.getUTCMinutes() + at.getUTCSeconds() / 60;
  const trueSolarMinutes = (utcMinutes + equationOfTime + 4 * lon) % 1440;
  const hourAngle = (trueSolarMinutes / 4 < 0 ? trueSolarMinutes / 4 + 180 : trueSolarMinutes / 4 - 180) * RAD;
  const sinAlt = Math.sin(lat * RAD) * Math.sin(declination) + Math.cos(lat * RAD) * Math.cos(declination) * Math.cos(hourAngle);
  return Math.asin(Math.max(-1, Math.min(1, sinAlt))) / RAD;
}

/** How dark it is, 0 (day) to 1 (night): full dusk by 12 degrees below the horizon, none above 6 degrees. */
export function nightFactor(altitudeDeg: number): number {
  return Math.max(0, Math.min(1, (6 - altitudeDeg) / 18));
}
