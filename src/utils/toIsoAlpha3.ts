// src/utils/iso3166.ts
// Utility to normalize country codes to ISO-3166 alpha‑3 (e.g., 'US' -> 'USA').
// Accepts alpha‑2 ('US'), alpha‑3 ('USA'), or common English names ('United States').
// Unknown/empty inputs fall back to 'USA' to satisfy Deluxe Embedded requirements.

const A2_TO_A3: Record<string, string> = {
    // North America
    US: "USA", CA: "CAN", MX: "MEX",
    // Central America / Caribbean (common)
    CR: "CRI", GT: "GTM", HN: "HND", NI: "NIC", PA: "PAN", SV: "SLV",
    DO: "DOM", PR: "PRI", JM: "JAM", HT: "HTI", TT: "TTO", BZ: "BLZ", BS: "BHS",
    // South America (common)
    AR: "ARG", BO: "BOL", BR: "BRA", CL: "CHL", CO: "COL", EC: "ECU",
    GY: "GUY", PE: "PER", PY: "PRY", SR: "SUR", UY: "URY", VE: "VEN",
    // Europe (popular)
    GB: "GBR", IE: "IRL", FR: "FRA", DE: "DEU", ES: "ESP", IT: "ITA", PT: "PRT",
    NL: "NLD", BE: "BEL", LU: "LUX", CH: "CHE", AT: "AUT", DK: "DNK", NO: "NOR",
    SE: "SWE", FI: "FIN", IS: "ISL", CZ: "CZE", SK: "SVK", PL: "POL", HU: "HUN",
    RO: "ROU", BG: "BGR", GR: "GRC",
    // APAC (popular)
    AU: "AUS", NZ: "NZL", JP: "JPN", KR: "KOR", CN: "CHN", IN: "IND", SG: "SGP",
    HK: "HKG", TW: "TWN", TH: "THA", VN: "VNM", MY: "MYS", PH: "PHL", ID: "IDN",
    // Middle East & Africa (popular)
    IL: "ISR", AE: "ARE", SA: "SAU", QA: "QAT", KW: "KWT", BH: "BHR", OM: "OMN",
    ZA: "ZAF", EG: "EGY", KE: "KEN", NG: "NGA", MA: "MAR", TN: "TUN",
  };
  
  const NAME_TO_A3: Record<string, string> = {
    "UNITED STATES": "USA",
    "UNITED STATES OF AMERICA": "USA",
    "UNITED KINGDOM": "GBR",
    "GREAT BRITAIN": "GBR",
    "SOUTH KOREA": "KOR",
    "NORTH KOREA": "PRK",
    "RUSSIA": "RUS",
    "CHINA": "CHN",
    "HONG KONG": "HKG",
    "TAIWAN": "TWN",
    "CZECH REPUBLIC": "CZE",
    "CZECHIA": "CZE",
    "BOLIVIA": "BOL",
    "LAOS": "LAO",
    "VIETNAM": "VNM",
    "IRAN": "IRN",
    "SYRIA": "SYR",
    "TANZANIA": "TZA",
    "VENEZUELA": "VEN",
    "BOSNIA AND HERZEGOVINA": "BIH",
  };
  
  /** Normalize a country input to ISO‑3166 alpha‑3. */
  export function toIsoAlpha3(input?: string | null): string {
    if (!input) return "USA";
    const s = String(input).trim();
    if (!s) return "USA";
    const up = s.toUpperCase();
    // If already 3 letters, assume alpha‑3 and return.
    if (/^[A-Z]{3}$/.test(up)) return up;
    // If two‑letter code we know, map to alpha‑3.
    if (/^[A-Z]{2}$/.test(up) && A2_TO_A3[up]) return A2_TO_A3[up];
    // Try name mapping (strip punctuation).
    const nameKey = up.replace(/[^A-Z ]+/g, " ").replace(/\s+/g, " ").trim();
    if (NAME_TO_A3[nameKey]) return NAME_TO_A3[nameKey];
    // Fallback: if two letters and unknown, pad with 'A' (not standard) -> use USA instead.
    return "USA";
  }
  
  /** Optionally convert alpha‑3 back to alpha‑2 (partial map). */
  export function toIsoAlpha2(input?: string | null): string {
    const a3 = toIsoAlpha3(input);
    const entry = Object.entries(A2_TO_A3).find(([, v]) => v === a3);
    return entry ? entry[0] : "US";
  }
  
  export default toIsoAlpha3;
  