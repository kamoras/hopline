/** The airports a flights board covers. Coordinates are the airport reference points. */
export interface Airport {
  /** IATA code: the id riders know. */
  code: string;
  name: string;
  lat: number;
  lon: number;
}

export const NORTHEAST_AIRPORTS: readonly Airport[] = [
  { code: "JFK", name: "New York JFK", lat: 40.6413, lon: -73.7781 },
  { code: "LGA", name: "New York LaGuardia", lat: 40.7769, lon: -73.874 },
  { code: "EWR", name: "Newark Liberty", lat: 40.6895, lon: -74.1745 },
  { code: "TEB", name: "Teterboro", lat: 40.8501, lon: -74.0608 },
  { code: "HPN", name: "Westchester County", lat: 41.067, lon: -73.7076 },
  { code: "ISP", name: "Long Island MacArthur", lat: 40.7952, lon: -73.1002 },
  { code: "HVN", name: "New Haven Tweed", lat: 41.2637, lon: -72.8868 },
  { code: "BDL", name: "Hartford Bradley", lat: 41.9389, lon: -72.6832 },
  { code: "PHL", name: "Philadelphia", lat: 39.8744, lon: -75.2424 },
  { code: "ACY", name: "Atlantic City", lat: 39.4576, lon: -74.5772 },
  // New England
  { code: "BOS", name: "Boston Logan", lat: 42.3656, lon: -71.0096 },
  { code: "BED", name: "Boston Hanscom", lat: 42.47, lon: -71.289 },
  { code: "ORH", name: "Worcester", lat: 42.2673, lon: -71.8757 },
  { code: "PVD", name: "Providence", lat: 41.7232, lon: -71.4325 },
  { code: "ACK", name: "Nantucket", lat: 41.2531, lon: -70.0602 },
  { code: "MHT", name: "Manchester-Boston", lat: 42.9326, lon: -71.4357 },
  { code: "PWM", name: "Portland, Maine", lat: 43.6462, lon: -70.3093 },
  { code: "BGR", name: "Bangor", lat: 44.8074, lon: -68.8281 },
  { code: "BTV", name: "Burlington, Vermont", lat: 44.4719, lon: -73.1533 },
  // Upstate New York and Pennsylvania
  { code: "ALB", name: "Albany", lat: 42.7483, lon: -73.8017 },
  { code: "SYR", name: "Syracuse", lat: 43.1112, lon: -76.1063 },
  { code: "ABE", name: "Lehigh Valley", lat: 40.6521, lon: -75.4408 },
  { code: "MDT", name: "Harrisburg", lat: 40.1935, lon: -76.7634 },
  { code: "PIT", name: "Pittsburgh", lat: 40.4915, lon: -80.2329 },
  // Maryland, Washington and Virginia
  { code: "BWI", name: "Baltimore/Washington", lat: 39.1754, lon: -76.6683 },
  { code: "DCA", name: "Washington Reagan", lat: 38.8512, lon: -77.0402 },
  { code: "IAD", name: "Washington Dulles", lat: 38.9531, lon: -77.4565 },
  { code: "RIC", name: "Richmond", lat: 37.5052, lon: -77.3197 },
  { code: "ORF", name: "Norfolk", lat: 36.8946, lon: -76.2012 },
];
