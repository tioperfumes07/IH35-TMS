/**
 * PERFUME-DESK — item identity from a vendor's free-text line.
 *
 * Every vendor writes the same bottle differently:
 *   "212 SEXY 3.4 EDP L  (100028) - Spain - 15pcs ByBox"     (Miami Trading Zone)
 *   "212 SEXY(W)EDP SP 3.4oz(NEW PACK)(ONLY USA)"             (Perfume Center of America)
 *   "CH 212 SEXY 3.4 EDP WOMAN" / "212 SEXY W 100ML" / "212 SEXY MUJER 3.3"
 * This module turns each into the same identity key: name words + bottle size + type + gender + flags.
 *
 * Owner rule (2026-11-12): an item is identified CORRECTLY or not at all. An exact key match links
 * automatically; anything less is a suggestion the owner confirms once, then it is remembered.
 * So the key is strict: "212 SEXY M" never equals "212 M", "360 RED" never equals "360".
 *
 * Pure functions only — no DB, no I/O — so every rule is unit-tested (normalize.test.ts).
 */

export type Gender = "M" | "W" | "U" | "";
export type Conc = "EDT" | "EDP" | "PARFUM" | "EXTRAIT" | "EDC" | "MIST" | "";

export type Identity = {
  brand: string;            // canonical brand, "" when the line names none we know
  nameWords: string[];      // the words that name the fragrance, brand/size/type/gender removed, in order
  sizeMl: number | null;    // standard bottle size in ml (3.3 oz, 3.4 oz, 100 ml → 100)
  conc: Conc;
  gender: Gender;
  flags: string[];          // TESTER, SET, MINI, REFILL, DAMAGED, UNBOXED — sorted
  key: string;              // strict identity key used for automatic links
  nameText: string;         // nameWords joined — what fuzzy suggestions compare
};

/* ---------------- brands ---------------- */

/** Short forms vendors use for a brand. Extended at runtime by perfume.brand_aliases rows. */
export const BUILTIN_BRAND_ALIASES: Record<string, string> = {
  "CH": "CAROLINA HERRERA",
  "C.H": "CAROLINA HERRERA",
  "C HERRERA": "CAROLINA HERRERA",
  "AB": "ANTONIO BANDERAS",
  "A.BANDERAS": "ANTONIO BANDERAS",
  "ANTONIO BANDERA'S": "ANTONIO BANDERAS",
  "GA": "GIORGIO ARMANI",
  "ARMANI": "GIORGIO ARMANI",
  "EMPORIO ARMANI": "GIORGIO ARMANI",
  "A.GRANDE": "ARIANA GRANDE",
  "AG": "ARIANA GRANDE",
  "B.S": "BRITNEY SPEARS",
  "CK": "CALVIN KLEIN",
  "D&G": "DOLCE & GABBANA",
  "DG": "DOLCE & GABBANA",
  "DOLCE AND GABBANA": "DOLCE & GABBANA",
  "JPG": "JEAN PAUL GAULTIER",
  "J.P.GAULTIER": "JEAN PAUL GAULTIER",
  "YSL": "YVES SAINT LAURENT",
  "MJ": "MARC JACOBS",
  "PH": "PARIS HILTON",
  "CHRISTIAN DIOR": "DIOR",
  "CRISTIAN DIOR": "DIOR",
  "DIOR COSMETICA": "DIOR",
  "PACO": "PACO RABANNE",
  "RABANNE": "PACO RABANNE",
  "BVLGARI": "BVLGARI",
  "BULGARI": "BVLGARI",
  "BVLGAR": "BVLGARI",
  "MONT BLANC": "MONTBLANC",
  "JEAN PAUL GAUTIER": "JEAN PAUL GAULTIER",
  "RALPH LAURENT": "RALPH LAUREN",
  "VICTORIA SECRET": "VICTORIAS SECRET",
  "ABERCROMBIE": "ABERCROMBIE & FITCH",
  "ABERCROMBIE AND FITCH": "ABERCROMBIE & FITCH",
  "A&F": "ABERCROMBIE & FITCH",
  "PACO RABANNE": "PACO RABANNE",
  "RABANNE PACO": "PACO RABANNE",
  "TOMMY": "TOMMY HILFIGER",
  "HUGO": "HUGO BOSS",
  "BOSS": "HUGO BOSS",
  "CR7": "CRISTIANO RONALDO",
  "THIERRY MUGLER": "MUGLER",
  "ESTEE": "ESTEE LAUDER",
  "ELIZABETH ARDEN": "ELIZABETH ARDEN",
  "E.ARDEN": "ELIZABETH ARDEN",
  "LANCOME": "LANCOME",
  "GIVENCHY": "GIVENCHY",
  "HERMES": "HERMES",
  "STEPHANE HL": "STEPHANE HUMBERT LUCAS",
  "STEPHANE HUMBER LUCAS 777": "STEPHANE HUMBERT LUCAS",
};

export function canonicalBrand(raw: string, extra: Record<string, string> = {}): string {
  // Apostrophes and trailing dots are spelling noise: VICTORIA'S = VICTORIAS, FABERGE CO. = FABERGE CO.
  const s = cleanSpaces(stripAccents(String(raw ?? "")).toUpperCase().replace(/[`’']/g, "").replace(/\.$/, ""));
  if (!s) return "";
  return extra[s] ?? BUILTIN_BRAND_ALIASES[s] ?? s;
}

/* ---------------- words ---------------- */

const GENDER_WORDS: Record<string, Gender> = {
  W: "W", L: "W", WOMAN: "W", WOMEN: "W", WOMENS: "W", LADY: "W", LADIES: "W", MUJER: "W", MUJERES: "W",
  DAMA: "W", DAMAS: "W", SENORA: "W", SENORAS: "W", FEMENINO: "W", FEMENINA: "W", FEM: "W", WMN: "W", WM: "W",
  M: "M", MAN: "M", MEN: "M", MENS: "M", HOMBRE: "M", HOMBRES: "M", CABALLERO: "M", CABALLEROS: "M",
  SENOR: "M", MASCULINO: "M", VARON: "M", MASC: "M",
  U: "U", UNISEX: "U", UNISEXO: "U",
  // HER / HIM are NOT gender words: "BURBERRY HER", "GUCCI GUILTY POUR HIM" are fragrance names.
};

/**
 * Name words vendors spell more than one way — each maps to ONE spelling for the identity key, so
 * "CK ONE" = "CK 1", "CK B" = "CK BE" = "CK BEE", "ONE MILLION" = "1 MILLION". Display keeps the vendor's words.
 */
export const SAME_NAME_WORD: Record<string, string> = {
  ONE: "1", TWO: "2", THREE: "3", FOUR: "4", FIVE: "5", SIX: "6", SEVEN: "7", EIGHT: "8", NINE: "9", TEN: "10",
  ELEVEN: "11", TWELVE: "12", TWENTY: "20", HUNDRED: "100",
  FIRST: "1ST", SECOND: "2ND", THIRD: "3RD",
  B: "BE", BEE: "BE",
};

/** Words that never help name a fragrance. POUR/HOMME/FEMME are kept as gender, not name. */
const NOISE = new Set([
  "SP", "SPR", "SPRAY", "VAPO", "VAPORISATEUR", "NATURAL", "NAT", "FOR", "THE", "BY", "DE", "DI", "LA", "LE",
  "EAU", "TOILETTE", "COLOGNE", "PARFUM", "PERFUME", "FRAGRANCE", "NEW", "PACK", "ONLY", "USA", "LI",
  "BOX", "BOXED", "BYBOX", "PCS", "PC", "OZ", "ML", "FL", "&", "AND", "Y", "EN", "POUR", "HOMME", "TST", "TSTR",
  "SPL", "VIAL", "CAP", "NO",
]);
/** NOISE words that ARE part of a name when they lead it (e.g. "LA BOMBA", "LE MALE", "EAU SO FRESH"). */
const KEEP_WHEN_FIRST = new Set(["LA", "LE", "EAU", "THE", "Y"]);

export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function cleanSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/* ---------------- size ---------------- */

/** Ounce sizes on vendor lists → the bottle's real ml. 3.3 and 3.4 are both the 100 ml bottle. */
const OZ_TO_ML: Array<[number, number]> = [
  [0.17, 5], [0.25, 7.5], [0.33, 10], [0.5, 15], [0.68, 20], [1.0, 30], [1.3, 40], [1.35, 40], [1.6, 50], [1.7, 50],
  [2.0, 60], [2.5, 75], [2.6, 80], [2.7, 80], [3.0, 90], [3.04, 90], [3.1, 90], [3.3, 100], [3.4, 100], [3.5, 100],
  [3.6, 110], [3.7, 110], [4.0, 120], [4.05, 120], [4.2, 125], [5.0, 150], [5.1, 150], [6.0, 180], [6.7, 200],
  [6.8, 200], [8.0, 236], [8.4, 250], [10.0, 300], [16.9, 500],
];
const STD_ML = [5, 7.5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 65, 70, 75, 80, 85, 90, 100, 110, 118, 120, 125, 150,
  160, 180, 200, 236, 250, 300, 500];

export function ozToMl(oz: number): number {
  for (const [o, ml] of OZ_TO_ML) if (Math.abs(o - oz) < 0.011) return ml;
  return snapMl(oz * 29.5735);
}
export function snapMl(ml: number): number {
  let best = ml, d = Infinity;
  for (const v of STD_ML) { const dd = Math.abs(v - ml); if (dd < d) { d = dd; best = v; } }
  return d <= Math.max(2, ml * 0.04) ? best : Math.round(ml);
}

/** Finds the bottle size in a line. Returns the ml and the text span to remove from the name. */
export function parseSize(text: string): { ml: number | null; spans: RegExp[] } {
  const s = text.toUpperCase();
  let m = s.match(/(\d+(?:\.\d+)?)\s*ML\b/);
  if (m) return { ml: snapMl(parseFloat(m[1])), spans: [/(\d+(?:\.\d+)?)\s*ML\b/] };
  m = s.match(/(\d*\.?\d+)\s*(?:FL\.?\s*)?OZ\b/);
  if (m) return { ml: ozToMl(parseFloat(m[1])), spans: [/(\d*\.?\d+)\s*(?:FL\.?\s*)?OZ\b/] };
  // A bare decimal ("212 3.4 EDT L", "SEXY MUJER 3.3") is an ounce size. Whole numbers are names (212, 360, 1881).
  m = s.match(/(?:^|[\sA-Z])(\d{1,2}\.\d{1,2})(?=\s|$|[A-Z(])/);
  if (m) return { ml: ozToMl(parseFloat(m[1])), spans: [/(\d{1,2}\.\d{1,2})(?=\s|$|[A-Z(])/] };
  return { ml: null, spans: [] };
}

/* ---------------- type ---------------- */

function parseConc(s: string): { conc: Conc; remove: RegExp[] } {
  const rules: Array<[RegExp, Conc]> = [
    [/\bEXTRAIT( DE PARFUM)?\b/, "EXTRAIT"],
    [/\bEAU DE PARFUM\b|\bEDP\b|\bE\.D\.P\b/, "EDP"],
    [/\bEAU DE TOILETTE\b|\bEDT\b|\bE\.D\.T\b/, "EDT"],
    [/\bEAU DE COLOGNE\b|\bEDC\b/, "EDC"],
    [/\bBODY MIST\b|\bHAIR MIST\b|\bMIST\b/, "MIST"],
    [/\bPARFUM\b|\bPERFUME\b/, "PARFUM"],
  ];
  for (const [re, c] of rules) if (re.test(s)) return { conc: c, remove: [re] };
  return { conc: "", remove: [] };
}

/* ---------------- flags ---------------- */

const FLAG_RULES: Array<[RegExp, string]> = [
  [/\bTESTERS?\b|\bTSTR?\b|\(T\)/, "TESTER"],
  [/\bLOTION\b|\bSHOWER GEL\b|\bBATH\b|\bDEO(DORANT)?\b|\bAFTER ?SHAVE\b|\bBALM\b|\bBODY SPRAY\b|\bBODY CREAM\b|\bHAIR\b/, "BODY"],
  [/\bCONCENTRATED\b|\bPERFUME OIL\b|\bATTAR\b/, "OIL"],
  [/\b\d+\s*PCS?\b\s*SET\b|\bGIFT SET\b|\bSET\b|\b\d\s*PC\b/, "SET"],
  [/\bMINI\b|\bMINIATURE\b/, "MINI"],
  [/\bREFILL\b|\bRECARGA\b/, "REFILL"],
  [/\bBOX DAMAGE\b|\bDAMAGED?\b|\bDMG\b/, "DAMAGED"],
  [/\bUNBOXED\b|\bNO BOX\b|\bSIN CAJA\b/, "UNBOXED"],
];
// "REFILLABLE" is the bottle design, not a refill — it stays out of REFILL on purpose (\bREFILL\b).

/* ---------------- main ---------------- */

export type IdentityInput = {
  description: string;
  brand?: string | null;
  size?: string | null;      // a separate size column, when the list has one
  gender?: string | null;    // a separate gender column ("Men", "Women")
  type?: string | null;      // a separate type column
  /** The list's section header the line sits under ("WOMEN", "MEN", "SETS MEN", "TESTERS WOMEN").
   *  Its gender / SET / TESTER / MINI apply when the line itself does not say. */
  section?: string | null;
  brandAliases?: Record<string, string>;
};

/**
 * Department codes vendors put in a column instead of a header. Read from the real Perfume Center of
 * America list of 2026-11-10 (each code checked against its lines): SM/SW are sets, MTST/WTST testers,
 * MMI/WMI minis, MDED/WDED deodorant & body spray, WB/L lotion, MA/S aftershave, MS/G WS/G shower gel,
 * XM/XW box-damage, OIL concentrated oil. Codes not listed here are read as words, never guessed.
 */
const DEPT_CODES: Record<string, { gender: Gender; flags: string[] }> = {
  M: { gender: "M", flags: [] }, W: { gender: "W", flags: [] }, U: { gender: "U", flags: [] }, UNI: { gender: "U", flags: [] },
  SM: { gender: "M", flags: ["SET"] }, SW: { gender: "W", flags: ["SET"] },
  MTST: { gender: "M", flags: ["TESTER"] }, WTST: { gender: "W", flags: ["TESTER"] },
  MMI: { gender: "M", flags: ["MINI"] }, WMI: { gender: "W", flags: ["MINI"] },
  MDED: { gender: "M", flags: ["BODY"] }, WDED: { gender: "W", flags: ["BODY"] },
  "WB/L": { gender: "W", flags: ["BODY"] }, "MA/S": { gender: "M", flags: ["BODY"] },
  "MS/G": { gender: "M", flags: ["BODY"] }, "WS/G": { gender: "W", flags: ["BODY"] },
  XM: { gender: "M", flags: ["DAMAGED"] }, XW: { gender: "W", flags: ["DAMAGED"] },
  OIL: { gender: "", flags: ["OIL"] },
};

/** Reads a section header: "SETS WOMEN" → { gender: "W", flags: ["SET"] }. */
export function readSection(section: string | null | undefined): { gender: Gender; flags: string[] } {
  const s = stripAccents(String(section ?? "")).toUpperCase().trim();
  if (!s) return { gender: "", flags: [] };
  if (DEPT_CODES[s]) return { gender: DEPT_CODES[s].gender, flags: [...DEPT_CODES[s].flags] };
  let gender: Gender = "";
  for (const w of s.split(/[^A-Z]+/)) if (GENDER_WORDS[w] && w.length > 1) gender = GENDER_WORDS[w];
  const flags: string[] = [];
  if (/\bSETS?\b|\bGIFT\b|\bESTUCHES?\b/.test(s)) flags.push("SET");
  if (/\bTESTERS?\b/.test(s)) flags.push("TESTER");
  if (/\bMINIS?\b|\bMINIATURES?\b/.test(s)) flags.push("MINI");
  return { gender, flags };
}

export function identify(input: IdentityInput): Identity {
  const aliases = input.brandAliases ?? {};
  let s = stripAccents(String(input.description ?? "")).toUpperCase();

  // Vendor-internal tails: MTZ "(100028) - Spain - 15pcs ByBox", PCA "(NEW PACK)(ONLY USA)(LI FREE)".
  s = s.replace(/\(\s*\d{4,}\s*\).*$/, " ");
  // "STRONGER W YOU" / "W/YOU" means WITH YOU, not women.
  s = s.replace(/\bW\/?\s*(?=YOU\b)/g, "WITH ");
  // Flags are read before parentheses are dropped, because PCA writes them as (T), (BOX DAMAGE ONLY).
  const flags = new Set<string>();
  for (const [re, f] of FLAG_RULES) if (re.test(s)) flags.add(f);
  // A set names its main bottle first; the extra pieces follow a "+" ("100% PASSION 3.4 EDT M + 6.7 H/BW + 15ML").
  // The item is the main bottle's name/size/type — the pieces after the first "+ <size>" are not the name.
  const plus = s.search(/\+\s*\d/);
  if (plus > 0) { flags.add("SET"); s = s.slice(0, plus); }

  // Gender from a dedicated column, then (M)/(W)/(U) markers.
  let gender: Gender = "";
  const gcol = cleanSpaces(stripAccents(String(input.gender ?? "")).toUpperCase());
  if (gcol) gender = GENDER_WORDS[gcol] ?? GENDER_WORDS[gcol.split(" ")[0]] ?? "";
  const paren = s.match(/\((M|W|U|L)[*.]?\)/);
  if (!gender && paren) gender = GENDER_WORDS[paren[1]];
  s = s.replace(/\([^)]*\)/g, " ");

  // Size: own column first, else in the text.
  const sizeFromCol = input.size ? parseSize(String(input.size)).ml : null;
  const ps = parseSize(s);
  const sizeMl = sizeFromCol ?? ps.ml;
  for (const re of ps.spans) s = s.replace(re, " ");

  // Type.
  const tcol = input.type ? parseConc(stripAccents(String(input.type)).toUpperCase()).conc : "";
  const pc = parseConc(s);
  const conc: Conc = tcol || pc.conc;
  for (const re of pc.remove) s = s.replace(re, " ");

  // Punctuation → spaces, but keep "&" and "'" inside brand words, and dots inside abbreviations like A.GRANDE.
  s = s.replace(/[^A-Z0-9&'.% ]+/g, " ").replace(/(?<!\d)%/g, " ").replace(/(?<![A-Z])\.|\.(?![A-Z0-9])/g, " ");
  let words = cleanSpaces(s).split(" ").filter(Boolean);

  // Brand: the brand column, else the longest known brand or alias the line starts with.
  let brand = canonicalBrand(input.brand ?? "", aliases);
  const known = Object.keys({ ...BUILTIN_BRAND_ALIASES, ...aliases });
  const brandValues = new Set(Object.values({ ...BUILTIN_BRAND_ALIASES, ...aliases }));
  if (brand) brandValues.add(brand);
  // Remove the brand's words wherever they lead the line, in any of its spellings.
  const spellings = [...known, ...brandValues].map((x) => x.split(" ")).sort((a, b) => b.length - a.length);
  for (const sp of spellings) {
    if (sp.length && sp.every((w, i) => words[i] === w)) {
      const canon = canonicalBrand(sp.join(" "), aliases);
      if (!brand || brand === canon) { brand = canon; words = words.slice(sp.length); }
      break;
    }
  }
  // A dash after a brand prefix ("GA-AQUA DE GIO") leaves the brand glued on; handled by punctuation step above.

  // Gender words (W, L, WOMAN, LADIES, MUJER, DAMA, M, MEN, MAN, HOMBRE, CABALLERO, POUR HOMME …).
  // The FIRST name word is never read as gender: it names the fragrance ("MAN IN BLACK", "LADY MILLION").
  // Every later gender word leaves the name; the last one wins (vendors put it after the name).
  // A dedicated gender column, when the list has one, outranks the text.
  const kept: string[] = [];
  let textGender: Gender = "";
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (kept.length > 0 && (w === "HOMME" || w === "FEMME")) { textGender = w === "HOMME" ? "M" : "W"; continue; }
    const g = GENDER_WORDS[w];
    if (g && kept.length > 0) { textGender = g; continue; }
    // A lone gender letter with nothing after it is the gender, never a name ("4711 3.4 EDC U": brand-only item).
    if (g && w.length === 1 && i === words.length - 1) { textGender = g; continue; }
    kept.push(w);
  }
  if (!gender) gender = textGender;
  const sec = readSection(input.section);
  if (!gender) gender = sec.gender;
  for (const f of sec.flags) flags.add(f);

  const shownWords = kept.filter((w, i) => !(NOISE.has(w) && !(i === 0 && KEEP_WHEN_FIRST.has(w))) && w !== ".");
  // Same word, different spelling (owner 2026-11-12: "ck b might also be ck bee, and ck one might also show up
  // as ck 1"). The KEY uses the one spelling; what the owner sees keeps the vendor's own words.
  const nameWords = shownWords.map((w) => SAME_NAME_WORD[w] ?? w);
  if (sizeMl != null && sizeMl <= 15 && !flags.has("SET")) flags.add("MINI");

  const flagList = [...flags].sort();
  // A brand-only product ("4711 EAU DE COLOGNE") has no name words: it is shown and matched by its brand.
  const nameText = shownWords.length ? shownWords.join(" ") : brand;
  const key = [brand || "?", nameWords.join(" "), sizeMl ?? "?", conc || "?", gender || "?", flagList.join("+")].join("|");
  return { brand, nameWords, sizeMl, conc, gender, flags: flagList, key, nameText };
}

/**
 * Brand-free key — for lists that name items without a brand (La Esperanza, Clásica): "212 SEXY W 3.4oz".
 * Two lines with the same loose key are the same bottle only if neither side names a DIFFERENT brand.
 */
export function looseKey(id: Identity): string {
  return [id.nameWords.join(" "), id.sizeMl ?? "?", id.conc || "?", id.gender || "?", id.flags.join("+")].join("|");
}

/** Normalized UPC: digits only, leading zeros dropped, at least 8 digits; anything else is not a UPC. */
export function normalizeUpc(v: unknown): string {
  let s = String(v ?? "").trim();
  s = s.replace(/\.0+$/, "");
  if (/^\d+(\.\d+)?e\+\d+$/i.test(s)) s = BigInt(Math.round(Number(s))).toString();
  const d = s.replace(/\D/g, "");
  if (d.length < 8 || d.length > 14) return "";
  return d.replace(/^0+/, "");
}

/* ---------------- vendor line ending ---------------- */

const COUNTRY_FIX: Record<string, string> = {
  "UNITED ARAB EMIR": "United Arab Emirates", "UNITED ARAB EMIR.": "United Arab Emirates", UAE: "United Arab Emirates",
  USA: "USA", "U.S.A.": "USA", UK: "United Kingdom",
};

/**
 * The part a vendor prints after the product: MTZ "CK FREE 1.7 EDT M  (101079) - France - 24pcs ByBox",
 * "GIVENCHY HOMME 3.4 EDT M (101798) - France - France - 24pcs ByBox", "389 BOADICEA - United Kingdom - 6pcs ByBox".
 * → the vendor's own code, the country of origin, and pieces per box. Only read when the line really ends that way
 * (a " - " segment with "pcs"), so a fragrance name with a hyphen is never cut.
 */
export function vendorLineTail(description: string | null | undefined): { code: string | null; country: string | null; casePack: number | null } {
  const s = String(description ?? "").trim();
  const segs = s.split(/\s+-\s+/);
  const last = segs[segs.length - 1] ?? "";
  const pcs = last.match(/(\d+)\s*pcs?\b/i);
  const code = segs[0]?.match(/\(\s*(\d{4,})\s*\)\s*$/)?.[1] ?? s.match(/\(\s*(\d{5,8})\s*\)/)?.[1] ?? null;
  if (segs.length < 2 || !pcs) return { code, country: null, casePack: null };
  const raw = segs.slice(1, -1).map((x) => x.trim()).find((x) => /^[A-Za-z][A-Za-z .'&]*$/.test(x)) ?? null;
  const country = raw ? (COUNTRY_FIX[raw.toUpperCase()] ?? raw.replace(/\s+/g, " ")) : null;
  return { code, country, casePack: Number(pcs[1]) };
}
