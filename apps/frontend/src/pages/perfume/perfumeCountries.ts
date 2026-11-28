/** Country of origin: items store the 2-letter code (FR, US, AE …); the screen shows the name beside it. */
export const COUNTRY_NAME: Record<string, string> = {
  FR: "France", IT: "Italy", ES: "Spain", US: "United States", AE: "United Arab Emirates", GB: "United Kingdom", DE: "Germany", CH: "Switzerland",
  MX: "Mexico", BR: "Brazil", NL: "Netherlands", JP: "Japan", KR: "Korea", CN: "China", IN: "India", TR: "Turkey", SA: "Saudi Arabia", PL: "Poland",
  PT: "Portugal", CA: "Canada", BE: "Belgium", AT: "Austria", SE: "Sweden", DK: "Denmark", IE: "Ireland", GR: "Greece", RU: "Russia", AU: "Australia",
  AR: "Argentina", CO: "Colombia", TH: "Thailand", ID: "Indonesia", SG: "Singapore", HK: "Hong Kong", TW: "Taiwan", IL: "Israel", EG: "Egypt",
  MA: "Morocco", ZA: "South Africa", KW: "Kuwait", QA: "Qatar", OM: "Oman", BH: "Bahrain", LB: "Lebanon", JO: "Jordan", CZ: "Czechia", HU: "Hungary",
};
export const countryLabel = (code: string | null | undefined) => (code ? (COUNTRY_NAME[code] ? `${code} · ${COUNTRY_NAME[code]}` : code) : "");
