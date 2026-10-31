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
];
