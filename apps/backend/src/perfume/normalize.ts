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
  /** A "+" set's other pieces, normalized ("34SG34BL"); "" for a single bottle. Part of the identity: two sets
   *  with the same main bottle and different contents are different products (audit 2026-11-12, Moonlight). */
  contents?: string;
};

/* ---------------- brands ---------------- */

/** Short forms vendors use for a brand. Extended at runtime by perfume.brand_aliases rows. */
export const BUILTIN_BRAND_ALIASES: Record<string, string> = {
  // ESPERANZA short forms measured live 11-15 (each checked against the item master's own brand spelling).
  "MAISON A": "MAISON ALHAMBRA",
  "MAISON A.": "MAISON ALHAMBRA",
  "AHMED": "AHMED AL MAGHRIBI",
  "B.SPEARS": "BRITNEY SPEARS",
  "B SPEARS": "BRITNEY SPEARS",
  "GLORIA VANDERVILT": "GLORIA VANDERBILT",
  "HERRERA": "CAROLINA HERRERA",
  "JEAN PAUL G": "JEAN PAUL GAULTIER",
  "JEAN PAUL G.": "JEAN PAUL GAULTIER",
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
  "ADP": "ACQUA DI PARMA",
  "AL HAMBRA": "ALHAMBRA",
  "D&G": "DOLCE & GABBANA",
  "DG": "DOLCE & GABBANA",
  "DOLCE AND GABBANA": "DOLCE & GABBANA",
  "JPG": "JEAN PAUL GAULTIER",
  "J.P.GAULTIER": "JEAN PAUL GAULTIER",
  "YSL": "YVES SAINT LAURENT",
  "MJ": "MARC JACOBS",
  "MARK JACOBS": "MARC JACOBS",
  // Owner 2026-11-16 11:59 CT ("all those 360 items are perry ellis, 212 carolina herrera, 5th avenue elizabeth arden,
  // armani giorgio armani, art is usually cartier, ch carolina herrera, dkny, frozen is disney, hugo hugo boss … common
  // names, abbreviations"). Each short form below was read off the 11-16 lines that named no brand (MOD, ESPERANZA,
  // PPW, CLASSIC, POTW, FRENCH, MINA DE ORO, UNITED B2B), mapped to the item master's own spelling.
  "CART": "CARTIER", "AREDEN": "ELIZABETH ARDEN", "ARDEN": "ELIZABETH ARDEN", "EA": "ELIZABETH ARDEN",
  "ELZBTH ARD": "ELIZABETH ARDEN", "ELZBTH ARDEN": "ELIZABETH ARDEN", "ELIZABETH A": "ELIZABETH ARDEN",
  "ELZBTH TAYLOR": "ELIZABETH TAYLOR", "ELZBTH TYLR": "ELIZABETH TAYLOR", "E.TAYLOR": "ELIZABETH TAYLOR",
  "DK": "DONNA KARAN",
  "P.H": "PARIS HILTON", "PARIS HILTION": "PARIS HILTON", "P.E": "PERRY ELLIS", "PERRY": "PERRY ELLIS",
  "K.C": "KENNETH COLE", "KC": "KENNETH COLE", "KENNETH K": "KENNETH COLE",
  "MK": "MICHAEL KORS", "M KORS": "MICHAEL KORS", "M.KORS": "MICHAEL KORS",
  "V.SECRET": "VICTORIAS SECRET", "V SECRET": "VICTORIAS SECRET",
  "VW": "VERA WANG", "VERAWANG": "VERA WANG", "V&R": "VIKTOR & ROLF", "V & R": "VIKTOR & ROLF",
  "BS": "BRITNEY SPEARS", "JS": "JESSICA SIMPSON", "J.S": "JESSICA SIMPSON", "JESSICA S": "JESSICA SIMPSON",
  "JB": "JUSTIN BIEBER", "J.B": "JUSTIN BIEBER", "JLO": "JENNIFER LOPEZ", "J.LO": "JENNIFER LOPEZ",
  "J.P.G": "JEAN PAUL GAULTIER", "GIV": "GIVENCHY", "SAL F": "SALVATORE FERRAGAMO", "SAL FERRAGAMO": "SALVATORE FERRAGAMO",
  "SAL": "SALVATORE FERRAGAMO", "MB": "MONTBLANC", "MARC J": "MARC JACOBS", "MARC JACOB": "MARC JACOBS",
  "BR": "BANANA REPUBLIC", "ARI G": "ARIANA GRANDE", "ARI": "ARIANA GRANDE", "BILL BL": "BILL BLASS", "BVGL": "BVLGARI",
  "CLINQUE": "CLINIQUE", "CHRIS LACROIX": "CHRISTIAN LACROIX", "CHRISTIAN LACRIOX": "CHRISTIAN LACROIX",
  "ROB CAVALLI": "ROBERTO CAVALLI", "ROBERTO CAVALI": "ROBERTO CAVALLI", "CAVALI": "ROBERTO CAVALLI",
  "LAG": "KARL LAGERFELD", "LOLITA LMPCKA": "LOLITA LEMPICKA", "JESS MC": "JESSICA MCCLINTOCK", "JESSICA MC": "JESSICA MCCLINTOCK",
  "SJ": "SEAN JOHN", "SEAN JEAN": "SEAN JOHN", "SJP": "SARAH JESSICA PARKER", "SARAH J P": "SARAH JESSICA PARKER",
  "SARAH J": "SARAH JESSICA PARKER", "VC": "VINCE CAMUTO", "KP": "KATY PERRY", "RIH": "RIHANNA", "RL": "RALPH LAUREN",
  "MQUEEN": "ALEXANDER MCQUEEN", "TOMMY B": "TOMMY BAHAMA", "TOMMY BAH": "TOMMY BAHAMA", "TOMMY BH": "TOMMY BAHAMA",
  "TOMMY BAHAMA": "TOMMY BAHAMA", "PIERRE C": "PIERRE CARDIN", "PORSHE DESIGN": "PORSCHE", "PORSCHE DESIGN": "PORSCHE",
  "MERCEDES": "MERCEDES BENZ", "A.E": "AMERICAN EAGLE", "MARK ECKO": "MARC ECKO", "ECKO": "MARC ECKO",
  "HARAMAIN": "AL HARAMAIN", "LATTFA": "LATTAFA", "LECHAMEAU": "LE CHAMEAU", "ASDAFF": "ASDAAF",
  "OSCAR": "OSCAR DE LA RENTA", "OSCAR DE LA RENTE": "OSCAR DE LA RENTA", "DALI": "SALVADOR DALI", "VICKY TEIL": "VICKY TIEL",
  "MC": "MARIAH CAREY", "MARIAH CAREY": "MARIAH CAREY", "ISAACMIZRAHI": "ISAAC MIZRAHI", "NY&C": "NEW YORK & COMPANY",
  "NY & CO": "NEW YORK & COMPANY", "BROOK BROTHERS": "BROOKS BROTHERS", "B. BROTHER": "BROOKS BROTHERS", "LAPIDUS": "TED LAPIDUS",
  "CASEWELL MASSEY": "CASWELL MASSEY", "ICEBURG": "ICEBERG", "URBAN OUTF": "URBAN OUTFITTERS", "SPAZIO KRIZIA": "KRIZIA",
  "B&B": "BATH & BODY WORKS", "B&BW": "BATH & BODY WORKS", "B&B WORKS": "BATH & BODY WORKS", "BATH & BODY WORKS": "BATH & BODY WORKS",
  "R.M": "RON MARONE", "RM": "RON MARONE", "RON MARONE": "RON MARONE", "RONMARONE": "RON MARONE",
  "NY YANKEES": "NEW YORK YANKEES", "YANKEES": "NEW YORK YANKEES", "NEW YORK YANKEES": "NEW YORK YANKEES",
  "KIM K": "KIM KARDASHIAN", "GWEN STEFANI": "GWEN STEFANI", "HARAJUKU": "GWEN STEFANI", "HARAJUKU LOVERS": "GWEN STEFANI",
  "PENGUIN": "ORIGINAL PENGUIN", "MAISON A. JEAN": "MAISON ALHAMBRA", "MAIOSN A": "MAISON ALHAMBRA",
  // Houses no other vendor carried yet: each spelling is the brand itself, so a line that names it reads its brand.
  "KISA": "KISA", "TOCCA": "TOCCA", "AVON": "AVON", "NEST": "NEST", "AMWAY": "AMWAY", "US ARMY": "US ARMY",
  "FERRARI": "FERRARI", "LAMBORGHINI": "LAMBORGHINI", "CARRERA": "CARRERA", "PITBULL": "PITBULL", "MAUBOUSSIN": "MAUBOUSSIN",
  "JENNI RIVERA": "JENNI RIVERA", "JOCKEY": "JOCKEY", "DOCKERS": "DOCKERS", "GAP": "GAP", "KANON": "KANON",
  "LUNICHE": "LUNICHE", "PATEK MAISON": "PATEK MAISON", "REEM ACRA": "REEM ACRA", "ROBERT GRAHAM": "ROBERT GRAHAM",
  "ADAM LEVINE": "ADAM LEVINE", "ALAN FLUSSER": "ALAN FLUSSER", "SWAROVSKI": "SWAROVSKI", "TAHARI": "TAHARI",
  "HELMUT LANG": "HELMUT LANG", "HEIDI KLUM": "HEIDI KLUM", "ANN TAYLOR": "ANN TAYLOR", "LANCASTER": "LANCASTER",
  "MOLINARD": "MOLINARD", "NORELL": "NORELL", "VICTOR MANUELLE": "VICTOR MANUELLE", "ROCAWEAR": "ROCAWEAR", "FUBU": "FUBU",
  "SONIA RYKIEL": "SONIA RYKIEL", "SORELLE FONTANA": "SORELLE FONTANA", "MARIELLA BURANI": "MARIELLA BURANI",
  "ORIGINS": "ORIGINS", "PUPA": "PUPA", "CADILLAC": "CADILLAC", "BALENCIAGA": "BALENCIAGA", "MARIA SHARAPOVA": "MARIA SHARAPOVA",
  "PETER THOMAS ROTH": "PETER THOMAS ROTH", "PETER THOMAS": "PETER THOMAS ROTH", "ISAAC MIZRAHI": "ISAAC MIZRAHI",
  "SPIEGEL": "SPIEGEL", "TED LAPIDUS": "TED LAPIDUS", "COMMODITY": "COMMODITY", "COMM": "COMMODITY", "FRESH": "FRESH",
  "KRIZIA": "KRIZIA", "ICEBERG": "ICEBERG", "CASWELL MASSEY": "CASWELL MASSEY", "MAXIM'S": "MAXIMS DE PARIS",
  "INES DE": "INES DE LA FRESSANGE", "ESTEBAN": "ESTEBAN", "BROOKS BROTHERS": "BROOKS BROTHERS", "AMERICAN EAGLE": "AMERICAN EAGLE",
  "TEXAS RANGERS": "TEXAS RANGERS", "ALEXANDER MCQUEEN": "ALEXANDER MCQUEEN", "CHRISTIAN LACROIX": "CHRISTIAN LACROIX",
  "KIM KARDASHIAN": "KIM KARDASHIAN", "ORIGINAL PENGUIN": "ORIGINAL PENGUIN", "NEW YORK & COMPANY": "NEW YORK & COMPANY",
  "URBAN OUTFITTERS": "URBAN OUTFITTERS",
  "PH": "PARIS HILTON",
  "PE": "PERRY ELLIS",
  "PACO R": "PACO RABANNE",
  "JC": "JUICY COUTURE",
  "TOMFORD": "TOM FORD",
  "HUGO B": "HUGO BOSS",
  // Owner 2026-11-14 17:34 CT: "SALVATORE FERRAGAMO, FERRAGAMO, OR SF AS BRAND IS THE SAME FERRAGAMO".
  "S.F": "SALVATORE FERRAGAMO",
  "S.FERRAGAMO": "SALVATORE FERRAGAMO",
  "S FERRAGAMO": "SALVATORE FERRAGAMO",
  "SF": "SALVATORE FERRAGAMO",
  "FERRAGAMO": "SALVATORE FERRAGAMO",
  "SALVATORRE FERRAGAMO": "SALVATORE FERRAGAMO", // the one item filed misspelled (measured live 11-14)
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
  // Brand spelled two or more ways in the live item master (measured 2026-11-12: 678 brands, pairs below).
  // The spelling with more items, or the house's full name, is canonical.
  "CALVIN": "CALVIN KLEIN",
  "DOLCE&GABBANA": "DOLCE & GABBANA",
  "STERLING PARFUMS": "STERLING", "STERLING PERFUMES": "STERLING",
  "NEW BRAND PERFUMES": "NEW BRAND",
  "AFNAN PERFUMES": "AFNAN",
  "KHALIS PERFUMES": "KHALIS", "KHALIS PERFUME": "KHALIS", "KHALIS PREFUME": "KHALIS", "KHALIS PERFUMEA": "KHALIS",
  "DONNA KARAN NEW YORK": "DONNA KARAN",
  "MEMO PARIS": "MEMO",
  "MAISON FRANCIS KURKDJIAN PARIS": "MAISON FRANCIS KURKDJIAN",
  "NARCISO": "NARCISO RODRIGUEZ", "NARCISO R": "NARCISO RODRIGUEZ", "NARCISO RDZ": "NARCISO RODRIGUEZ",
  "ROJA": "ROJA PARFUMS", "ROJA DOVE": "ROJA PARFUMS",
  "FLAVIA PARFUM": "FLAVIA",
  "JUICYCOUTURE": "JUICY COUTURE",
  "VIKTOR&ROLF": "VIKTOR & ROLF",
  "INITIO": "INITIO PARFUMS PRIVES",
  "DUMONT PARIS": "DUMONT",
  "TIFFANY & CO": "TIFFANY",
  "JOVOY": "JOVOY PARIS",
  "SEZAN PERFUMES": "SEZAN",
  "NASMA PERFUMES": "NASMA",
  "GIORGIO ARMAMI": "GIORGIO ARMANI",
  "GIORGIO B.H": "GIORGIO BEVERLY HILLS",
  "REEF": "REEF PERFUMES",
  "BDK": "BDK PARFUMS",
  "ESSENTIAL": "ESSENTIAL PARFUMS",
  "BOADICEA THE VICTORIOUS": "BOADICEA",
  "NINNA RICCI": "NINA RICCI",
  // Owner 2026-11-14 18:23 CT, on the ESPERANZA list: "jessica s is fancy, choo is jimmy choo, jlo is jennifer lopez,
  // jovan jovan, juicy c is juicy couture … hb is hugo boss … halloween is j del pozo" + his BRAND column corrections.
  "JESSICA SIMPSON": "JESSICA SIMPSON", "JESSICA SIMPSONS": "JESSICA SIMPSON",
  "CHOO": "JIMMY CHOO", "JIMMY CHOO": "JIMMY CHOO",
  "J LO": "JENNIFER LOPEZ", "JENNIFER LOPEZ": "JENNIFER LOPEZ",
  "JOVAN": "JOVAN", "JUICY": "JUICY COUTURE",
  "HB": "HUGO BOSS",
  "V&ROLF": "VIKTOR & ROLF", "VIKTOR AND ROLF": "VIKTOR & ROLF",
  "MICHEAL KORS": "MICHAEL KORS", "MICHAEL KORRS": "MICHAEL KORS",
  "P HILTON": "PARIS HILTON", "PARIS H": "PARIS HILTON",
  "PR": "PACO RABANNE",
  "SABRINA CARPENTER": "SABRINA CARPENTER", "SOFIA VERGARA": "SOFIA VERGARA", "SOFIA": "SOFIA VERGARA",
  "VALENTINP": "VALENTINO", "UNGARO": "EMANUEL UNGARO", "UNAGRO": "EMANUEL UNGARO",
  "RALPH": "RALPH LAUREN", "RALPH L": "RALPH LAUREN",
  "ORIENTICA": "ORIENTICA", "SHAKIRA": "SHAKIRA", "VERA WANG": "VERA WANG", "STETSON": "STETSON", "VICKY TIEL": "VICKY TIEL",
  "OSCAR DE LA RENTA": "OSCAR DE LA RENTA", 
  "J DEL POZO": "JESUS DEL POZO", "J. DEL POZO": "JESUS DEL POZO", "JESUS DEL POZO": "JESUS DEL POZO",
  "UNITED COLORS OF BENETTON": "BENETTON", "BENETTON": "BENETTON", "BENNETON": "BENETTON",
  "NINA": "NINA RICCI", "DONNA": "DONNA KARAN",
  // Owner 2026-11-14 19:11 CT: "donna, dkny, donna karan are the same one."
  "DKNY": "DONNA KARAN", "D.K.N.Y": "DONNA KARAN", "DONNA KARAN NY": "DONNA KARAN",
  // Measured live 11-14 6:45 PM CT on the 209 ESPERANZA lines still without a brand, and on misspelled item brands.
  // Owner 2026-11-14 18:48 CT, his own offer list's brand column: "GIORA it is giorgio armani … hol is hollister, issey is
  // issey miyake, jdel is j del pozo, montb is mont blanc, mosch is moschino, nauti is nautica, narciso rd is narciso
  // rodriguez, nin is nina ricci, salvf is ferragamo, their is thierry mugler, clean mine as well" — every short brand
  // on his list (measured live 18:49: 69 distinct values) mapped to the brand his vendors use.
  "GIORA": "GIORGIO ARMANI", "GIORG": "GIORGIO ARMANI", "HOL": "HOLLISTER", "ISSEY": "ISSEY MIYAKE", "ISSSEY": "ISSEY MIYAKE",
  "JDEL": "JESUS DEL POZO", "J DEL": "JESUS DEL POZO", "MONTB": "MONTBLANC", "MOSCH": "MOSCHINO", "MOSH": "MOSCHINO",
  "NAUTI": "NAUTICA", "NARCISO RD": "NARCISO RODRIGUEZ", "NIN": "NINA RICCI", "SALVF": "SALVATORE FERRAGAMO",
  "THEIR": "MUGLER", "THIER": "MUGLER", "ARIANAG": "ARIANA GRANDE", "BVLGA": "BVLGARI", "CACHA": "CACHAREL", "CALVI": "CALVIN KLEIN",
  "CAROH": "CAROLINA HERRERA", "DOLCE": "DOLCE & GABBANA", "ELIZA": "ELIZABETH ARDEN", "JEAN": "JEAN PAUL GAULTIER", "JIMMY": "JIMMY CHOO",
  "LACOS": "LACOSTE", "LANCO": "LANCOME", "M-BENZ": "MERCEDES BENZ", "MARCJ": "MARC JACOBS", "M JACOBS": "MARC JACOBS", "MICHK": "MICHAEL KORS",
  "PARIH": "PARIS HILTON", "SABRINA": "SABRINA CARPENTER", "SMADDEN": "STEVE MADDEN", "SWISS": "SWISS ARMY", "VICTORINOX SWISS ARMY": "SWISS ARMY",
  "TOMMY HILFIGHER": "TOMMY HILFIGER", "TORY": "TORY BURCH", "VALEN": "VALENTINO", "VERSA": "VERSACE", "VICKYT": "VICKY TIEL",
  "VICTS": "VICTORIAS SECRET", "HUGO BOSS": "HUGO BOSS", "VS": "VICTORIAS SECRET",
  // Owner 18:51 CT: "m malul is michael malul".
  "M.MALUL": "MICHAEL MALUL", "M MALUL": "MICHAEL MALUL", "MALUL": "MICHAEL MALUL", "MICHAEL MALUL": "MICHAEL MALUL",
  "BURBE": "BURBERRY", "BEILISH": "BILLIE EILISH", "SALVATORE FERREGAMO": "SALVATORE FERRAGAMO", "CHRISTIAN AUDIGIER": "ED HARDY",
  "G.ARMANI": "GIORGIO ARMANI", "G ARMANI": "GIORGIO ARMANI", "H.B": "HUGO BOSS", "J.CHOO": "JIMMY CHOO", "J CHOO": "JIMMY CHOO",
  "JIMMI CHOO": "JIMMY CHOO", "JINNY CHOO": "JIMMY CHOO", "MER-BENZ": "MERCEDES BENZ", "MER BENZ": "MERCEDES BENZ", "MERCEDES-BENZ": "MERCEDES BENZ",
  "BENETON": "BENETTON", "TOOMY": "TOMMY HILFIGER", "BVLGARY": "BVLGARI", "CAROLINA H": "CAROLINA HERRERA", "A.GRAND": "ARIANA GRANDE",
  "A. GRANDE": "ARIANA GRANDE", "A GRANDE": "ARIANA GRANDE", "ARIANA G": "ARIANA GRANDE", "CRISTIANO R": "CRISTIANO RONALDO",
  "CRITIANO RONALDO": "CRISTIANO RONALDO", "B. S": "BRITNEY SPEARS", "LOLITA LEMPICK": "LOLITA LEMPICA",
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
  DAMA: "W", DAMAS: "W", SENORA: "W", SENORAS: "W", FEMENINO: "W", FEMENINA: "W", FEM: "W", WMN: "W", WM: "W", WOM: "W",
  M: "M", MAN: "M", MEN: "M", MENS: "M", HOMBRE: "M", HOMBRES: "M", CABALLERO: "M", CABALLEROS: "M",
  SENOR: "M", MASCULINO: "M", VARON: "M", MASC: "M",
  U: "U", UNISEX: "U", UNISEXO: "U",
  // HER / HIM are NOT gender words: "BURBERRY HER", "GUCCI GUILTY POUR HIM" are fragrance names.
};

/**
 * Owner 2026-11-12: "detect her / hers as woman and his / him as men … in BURBERRY BRIT HER it is recommending for
 * him". These words stay IN the name (they name the fragrance) but tell the gender when nothing else does.
 */
const NAME_GENDER_HINT: Record<string, Gender> = { HER: "W", HERS: "W", ELLE: "W", SHE: "W", HIM: "M", HIS: "M", LUI: "M", HE: "M" };
/** Gender a name implies by its own words (HER, HIM, POUR FEMME …), or "" when it names none. */
export function genderHintOf(text: string): Gender {
  let g: Gender = "";
  for (const w of String(text ?? "").toUpperCase().split(/[^A-Z]+/)) {
    if (NAME_GENDER_HINT[w]) g = NAME_GENDER_HINT[w];
    else if (w === "FEMME") g = "W";
    else if (w === "HOMME") g = "M";
    else if (w === "UNISEX" || w === "UNISEXO") g = "U";
  }
  return g;
}

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
  "SPL", "VIAL", "CAP", "NO", "TESTER", "TESTERS",
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
export function exactMl(ml: number): number {
  return Math.round(ml * 10) / 10;
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
  // A size written in ML is the size, exactly as written (4 ML mini, 1.2 ML vial). Only ounce sizes are converted
  // and snapped to the bottle they mean.
  if (m) return { ml: exactMl(parseFloat(m[1])), spans: [/(\d+(?:\.\d+)?)\s*ML\b/] };
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

/** Owner 2026-11-14: "if one shows 100ml and another 105 or 120, its ok, but if one description has 100ml, it should
 *  not suggest the 60ml or 30ml." Two known sizes are the same bottle only within 25% of the larger one
 *  (100 ↔ 105 / 120 yes; 100 ↔ 75 / 60 / 30 no). An unknown size never blocks. */
export function sizesFar(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null || b == null || a <= 0 || b <= 0) return false;
  return Math.abs(a - b) / Math.max(a, b) > 0.25;
}

/* ---------------- flags ---------------- */

const FLAG_RULES: Array<[RegExp, string]> = [
  [/\bTESTERS?\b|\bTSTR?\b|\(T\)/, "TESTER"],
  [/\bLOTION\b|\bSHOWER GEL\b|\bBATH\b|\bDEO(DORANT)?\b|\bAFTER ?SHAVE\b|\bBALM\b|\bBODY SPRAY\b|\bBODY CREAM\b|\bHAIR\b|\bCREAM\b|\bSOAP\b|\bSHAMPOO\b|\bLIPSTICK\b|\bLIP GLOSS\b|\bMASCARA\b|\bEYELINER\b|\bFOUNDATION\b|\bMAKE ?UP\b|\bNAIL POLISH\b|\bSKIN ?CARE\b|\bSERUM\b|\bPOWDER\b|\bBLUSH\b|\bSCRUB\b/, "BODY"],
  // Not a fragrance and not a cosmetic: blotters, bags, backpacks and other store/gift items ("various").
  [/\bBLOTTERS?\b|\bBAGS?\b|\bBACKPACKS?\b|\bPOUCH(ES)?\b|\bTOTES?\b|\bKEY ?CHAINS?\b|\bUMBRELLAS?\b|\bWALLETS?\b|\bDISPLAYS?\b|\bPOSTERS?\b|\bMIRRORS?\b|\bCANDLES?\b|\bTOWELS?\b|\bCASES?\b|\bGIFT BOX(ES)?\b|\bSTRIPS?\b/, "VARIOUS"],
  [/\bCONCENTRATED\b|\bPERFUME OIL\b|\bATTAR\b/, "OIL"],
  // A set is also a CANISTER, a TRIO, a COFFRET, "4X25ML" or any "<n>PCS" (owner 2026-11-14 18:23 CT: "you did not
  // extract some sets correctly" — 360 CORAL W CANISTER, 360 W TRIO, MARVEL 4X25ML COFFRET, GUESS 3PCS ET).
  [/\b\d+\s*PCS?\b\s*SET\b|\bGIFT SET\b|\bSET\b|\b\d\s*PCS?\b|\bCANISTERS?\b|\bTRIO\b|\bCOF+R?FRETS?\b|\bCOFFRETS?\b|\b\d+\s*X\s*\d+(?:\.\d+)?\s*ML\b/, "SET"],
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
  /** Fragrance-name → brand cross-reference (nameBrandIndex) for lines that name no brand. Defaults to the one the
   *  desk loaded from every vendor's items (setNameBrands). */
  nameBrands?: Record<string, string>;
};

/**
 * Owner 2026-11-14 18:23 CT, on the ESPERANZA list: a fragrance name can BE the brand's signature — the line names no
 * brand, the name tells it ("212" Carolina Herrera, "360" Perry Ellis, "POLO" Ralph Lauren, "SPIDERMAN" Marvel,
 * "HALLOWEEN" J. del Pozo, "FANCY" Jessica Simpson, "HOT" / "COLD" Benetton). These words stay in the name; they only
 * give the brand when nothing else does. Each line is the owner's own correction.
 */
export const NAME_BRAND_HINTS: Record<string, string> = {
  "212": "CAROLINA HERRERA", "360": "PERRY ELLIS", "360RED": "PERRY ELLIS", "PORTFOLIO": "PERRY ELLIS",
  "POLO": "RALPH LAUREN", "RALPH CLUB": "RALPH LAUREN", "RALPHS CLUB": "RALPH LAUREN",
  "SUNFLOWERS": "ELIZABETH ARDEN", "WHITE DIAMONDS": "ELIZABETH ARDEN", "WHITE TEA": "ELIZABETH ARDEN", "RED DOOR": "ELIZABETH ARDEN",
  "PRINCESS": "DISNEY", "FROZEN": "DISNEY", "MICKEY": "DISNEY", "MINNIE": "DISNEY",
  "SPIDERMAN": "MARVEL", "SPIDER MAN": "MARVEL", "IRON MAN": "MARVEL", "CAPTAIN AMERICA": "MARVEL", "DEADPOOL": "MARVEL",
  "AVENGERS": "MARVEL", "HULK": "MARVEL", "THOR": "MARVEL", "BLACK PANTHER": "MARVEL", "MARVEL": "MARVEL",
  "STALLION": "EMPER", "UNFORGIVABLE": "SEAN JOHN", "UNTOLD": "ARMAF", "YOUTH DEW": "ESTEE LAUDER", "Z 14": "HALSTON",
  "SUNG": "ALFRED SUNG", "VIVA LA JUICY": "JUICY COUTURE", "VOLUPTE": "OSCAR DE LA RENTA", "MR BURBERRY": "BURBERRY",
  "MY BURBERRY": "BURBERRY", "PASHA": "CARTIER", "FANCY": "JESSICA SIMPSON", "HOT": "BENETTON", "COLD": "BENETTON",
  "HALLOWEEN": "JESUS DEL POZO", "HALOWEEN": "JESUS DEL POZO", "ACQUA DI GIO": "GIORGIO ARMANI", "ACQUA DI GIOIA": "GIORGIO ARMANI",
  "CURIOUS": "BRITNEY SPEARS", "CURIOS": "BRITNEY SPEARS", "FANTASY": "BRITNEY SPEARS", "DRAKKAR": "GUY LAROCHE", "ANGEL": "MUGLER",
  "ALIEN": "MUGLER", "GREY FLANNEL": "GEOFFREY BEENE", "AMAZING": "BILL BLASS",
  // Owner 18:48 CT: "those without brands, signorina, uomo, are ferragamo".
  "SIGNORINA": "SALVATORE FERRAGAMO", "SIGORINA": "SALVATORE FERRAGAMO", "UOMO": "SALVATORE FERRAGAMO",
  // Owner 2026-11-16 11:59 CT: signature names that tell the house when the line names none.
  "5TH AVENUE": "ELIZABETH ARDEN", "FIFTH AVENUE": "ELIZABETH ARDEN", "GREEN TEA": "ELIZABETH ARDEN", "ARDEN BEAUTY": "ELIZABETH ARDEN",
  "WHITE DIAMOND": "ELIZABETH ARDEN", "W DIAMONDS": "ELIZABETH ARDEN", "SPARKLING WHITE DIAMONDS": "ELIZABETH ARDEN",
  "DIAMONDS & RUBIES": "ELIZABETH TAYLOR", "DIAMONDS & SAPHIRES": "ELIZABETH TAYLOR", "DIAMONDS&RUBIES": "ELIZABETH TAYLOR",
  "DIAMONDS&ESMERALD": "ELIZABETH TAYLOR", "PASSION": "ELIZABETH TAYLOR",
  "222": "CAROLINA HERRERA", "CAROLINA": "CAROLINA HERRERA", "CH CH": "CAROLINA HERRERA", "GOOD GIRL": "CAROLINA HERRERA",
  "STITCH": "DISNEY", "TSUM TSUM": "DISNEY", "PRINCESS ARIEL": "DISNEY", "WINNIE POOH": "DISNEY", "CARS": "DISNEY", "CAR JACKSON": "DISNEY",
  "CARS JACKSON": "DISNEY", "SPONGE": "NICKELODEON", "SPONGEBOB": "NICKELODEON",
  "COOL WATER": "DAVIDOFF", "ANAIS ANAIS": "CACHAREL", "NOA": "CACHAREL", "AMOR AMOR": "CACHAREL",
  "MISS DIOR": "DIOR", "JADORE": "DIOR", "J'ADORE": "DIOR", "TERRE D HERMES": "HERMES", "TERRE D": "HERMES",
  "OBSESSION": "CALVIN KLEIN", "ESCAPE": "CALVIN KLEIN", "ETERNITY": "CALVIN KLEIN", "EUPHORIA": "CALVIN KLEIN",
  "HAPPY": "CLINIQUE", "PLEASURES": "ESTEE LAUDER", "PLEASURE BLOOM": "ESTEE LAUDER", "PLEASURE INTENSE": "ESTEE LAUDER",
  "BEAUTIFUL": "ESTEE LAUDER", "INTUITION": "ESTEE LAUDER", "TRESOR": "LANCOME", "LA VIE EST BELLE": "LANCOME", "MAGNIFIQUE": "LANCOME",
  "LIGHT BLUE": "DOLCE & GABBANA", "FLOWER BOMB": "VIKTOR & ROLF", "FLOWERBOMB": "VIKTOR & ROLF", "SPICEBOMB": "VIKTOR & ROLF",
  "CHARLIE": "REVLON", "CABOTINE": "GRES", "QUORUM": "ANTONIO PUIG", "TABOO": "DANA", "ORGANZA": "GIVENCHY", "AMARIGE": "GIVENCHY",
  "SHI": "ALFRED SUNG", "BORA BORA": "LIZ CLAIBORNE", "SPARK": "LIZ CLAIBORNE", "CURVE": "LIZ CLAIBORNE",
  "9PM": "AFNAN", "9AM": "AFNAN", "SUPREMACY": "AFNAN", "HAWAS": "RASASI", "BARAKKAT": "FRAGRANCE WORLD",
  "ROME EXTRADOSE": "BHARARA", "ROME POUR HOMME": "BHARARA", "ROME PARADOXE": "BHARARA", "GAME OF SPADE": "JO MILANO",
  "GAME OF SPADES": "JO MILANO", "ENCORE": "LUNICHE", "AZIZA": "LUNICHE", "AUTOGRAPH": "LUNICHE", "FUSTAQ": "LUNICHE",
  "TUFAAH": "LUNICHE", "LUMINOUS": "PATEK MAISON", "PRISME": "PATEK MAISON", "MERAKAI": "PATEK MAISON",
  "AURA SWAROVSKI": "SWAROVSKI", "UNBREAKABLE LOVE": "KHLOE & LAMAR", "UNBREAKABLE BOND": "KHLOE & LAMAR",
  "MINAJESTY": "NICKI MINAJ", "CHOCO MUSK": "AL REHAB", "INSURRECTION": "REYANE TRADITION", "TERRITOIRE": "BOUCHERON",
  "SOMEDAY": "JUSTIN BIEBER", "FANCY LOVE": "JESSICA SIMPSON", "GIRLFRIEND": "JUSTIN BIEBER", "WONDERSTRUCK": "TAYLOR SWIFT",
  "HILLARY WITH LOVE": "HILARY DUFF", "WITHLOVE": "HILARY DUFF", "TOUCH FRED HAY": "FRED HAYMAN", "DECLARATION": "CARTIER",
  "STRONGER WITH YOU": "GIORGIO ARMANI", "CODE": "GIORGIO ARMANI", "ARMANI CODE": "GIORGIO ARMANI",
  "SAUVAGE": "DIOR", "ALLURE": "CHANEL", "COCO": "CHANEL", "BLEU DE CHANEL": "CHANEL",
};
let DESK_NAME_BRANDS: Record<string, string> = {};
/** The desk's cross-reference, loaded from every vendor's items (PCA, MTZ, JIZAN, NANDANSONS …). */
export function setNameBrands(m: Record<string, string>): void { DESK_NAME_BRANDS = m; }
const GENERIC_NAME_WORDS = new Set(["BLUE", "BLACK", "WHITE", "RED", "GOLD", "PINK", "ROSE", "NOIR", "LOVE", "SEXY", "SPORT", "INTENSE",
  "NIGHT", "OUD", "MUSK", "AMBER", "PURE", "CLASSIC", "ORIGINAL", "FRESH", "LIGHT", "DARK", "HOMME", "FEMME", "MAN", "MEN", "WOMAN",
  "WOMEN", "GIRL", "BOY", "BODY", "MIST", "SET", "MINI", "TESTER", "EDT", "EDP", "PARFUM", "COLOGNE", "SPRAY", "NEW", "THE", "DE", "LA",
  "LE", "EAU", "POUR", "FOR", "MY", "MR", "MISS", "ONE", "1", "2", "3", "4", "5", "COLLECTION", "EDITION", "ELIXIR", "ABSOLU", "EXTREME",
  "ROYAL", "PRIVE", "SILVER", "GREEN", "PURPLE", "ORANGE", "VELVET", "SECRET", "DREAM", "GOOD", "BAD", "WILD", "CHERRY", "VANILLA", "COCONUT"]);
/**
 * Cross-reference every brand from every vendor's lists (owner 18:25 CT: "you should have used a cross reference to
 * check all brands from all lists from pca, mtz, etc"): the first 1–3 words of each item's fragrance name, kept only
 * when ONE brand owns them across the whole item master. A single word must be 3+ characters and not a generic word.
 */
export function nameBrandIndex(items: ReadonlyArray<{ brand: string; name: string }>, aliases: Record<string, string> = {}): Record<string, string> {
  const canon = items.map((it) => ({ brand: canonicalBrand(it.brand, aliases), name: it.name }));
  const count = new Map<string, number>();
  for (const c of canon) if (c.brand) count.set(c.brand, (count.get(c.brand) ?? 0) + 1);
  // A name that starts with ANY brand's first word ("BURBERRY HER" filed under a misspelled "BURBE", "GUESS UOMO"
  // filed under "SALVATORE FERREGAMO" — measured live 11-14) never teaches a brand: the line's own brand reads it.
  const brandFirst = new Set<string>([...count.keys(), ...Object.keys(BUILTIN_BRAND_ALIASES), ...Object.values(BUILTIN_BRAND_ALIASES)]
    .map((b) => b.toUpperCase().replace(/[^A-Z0-9&]+/g, " ").trim().split(" ")[0]!).filter((w) => w.length >= 3));
  const seen = new Map<string, Map<string, number>>();
  for (const c of canon) {
    if (!c.brand || (count.get(c.brand) ?? 0) < 3) continue; // a brand on 1–2 items is too thin to teach anything
    const bw = new Set(c.brand.split(" "));
    const w = String(c.name ?? "").toUpperCase().replace(/'/g, "").replace(/[^A-Z0-9&]+/g, " ").trim().split(" ").filter((x) => x && !bw.has(x));
    if (!w.length || brandFirst.has(w[0]!)) continue;
    for (let n = 1; n <= Math.min(3, w.length); n++) {
      const ph = w.slice(0, n).join(" ");
      if (n === 1 && (ph.length < 3 || GENERIC_NAME_WORDS.has(ph))) continue;
      const m = seen.get(ph) ?? new Map<string, number>();
      m.set(c.brand, (m.get(c.brand) ?? 0) + 1); seen.set(ph, m);
    }
  }
  const out: Record<string, string> = {};
  for (const [ph, m] of seen) {
    // One brand owns the phrase — or so dominates it that the others are a different product line sharing a
    // word ("DAISY": MARC JACOBS 47 items, DISNEY "Daisy Duck" 2 — measured live 11-15): 5+ items and at least
    // ten times every other brand together.
    const ranked = [...m].sort((a, b) => b[1] - a[1]);
    const rest = ranked.slice(1).reduce((t, [, k]) => t + k, 0);
    if (m.size !== 1 && !(ranked[0]![1] >= 5 && ranked[0]![1] >= 10 * rest)) continue;
    const [b, n] = ranked[0]!;
    if (!ph.includes(" ") && n < 2) continue; // one word must be seen on 2+ items of that brand
    out[ph] = b;
  }
  return out;
}
let DESK_BRANDS: string[] = [];
/** Every brand the item master carries on 5+ items — read wherever it sits in a line that names no other brand. */
export function setDeskBrands(b: string[]): void { DESK_BRANDS = b; }
function brandFromName(words: readonly string[], idx: Record<string, string>): string {
  for (let n = Math.min(3, words.length); n >= 1; n--) {
    const ph = words.slice(0, n).join(" ");
    const hit = NAME_BRAND_HINTS[ph] ?? idx[ph];
    if (hit) return hit;
  }
  return "";
}

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

const spellingsCache = new WeakMap<Record<string, string>, { list: string[][]; has: Set<string>; desk: string[]; n: number }>();
const EMPTY_ALIASES: Record<string, string> = {};
/** Every brand spelling (built-in aliases, the desk's aliases, their brands, the item master's brands), longest first. */
function spellingsFor(aliases: Record<string, string>): { list: string[][]; has: Set<string> } {
  const key = aliases ?? EMPTY_ALIASES;
  const hit = spellingsCache.get(key);
  // The match index adds item brands to its alias object as it loads — a changed size rebuilds the list.
  const n = Object.keys(key).length;
  if (hit && hit.desk === DESK_BRANDS && hit.n === n) return hit;
  const known = [...Object.keys({ ...BUILTIN_BRAND_ALIASES, ...key }), ...DESK_BRANDS];
  const values = Object.values({ ...BUILTIN_BRAND_ALIASES, ...key });
  const all = [...new Set([...known, ...values])];
  const entry = { list: all.map((x) => x.split(" ")).sort((a, b) => b.length - a.length), has: new Set(all), desk: DESK_BRANDS, n };
  spellingsCache.set(key, entry);
  return entry;
}

/** Fragrance lines vendors write in the brand column → the house that owns them. */
const LINE_HOUSE: Record<string, string> = { HALLOWEEN: "JESUS DEL POZO" };
/** The pieces a set lists before its fragrance: sizes, types and the extra items (gel, lotion, aftershave, mini…). */
const SET_PIECE_WORD_RE = new RegExp(
  "^(?:EDT|EDP|EDC|PARFUM|COLOGNE|SPRAY|SHOWER\\s*GEL|HAIR\\s*&?\\s*BODY\\s*WASH|H\\/BW|BODY\\s*WASH|BODY\\s*LOTION|BODY\\s*SPRAY|BODY\\s*MIST|" +
  "B\\/\\s*LOTION|BLOTION|S\\/\\s*GEL|SGEL|SG|GEL|BL|LOTION|AFTER\\s*SHAVE\\s*(?:BLAM|BALM)?|A\\/\\s*SHAVE|AFTERSHAVE|AFTER\\s*S\\/?|" +
  "DEO(?:DORANT)?(?:\\s*(?:SPRAY|STICK))?|FRAGRANCE\\s*MIST|MIST|TRAVEL\\s*SPRAY|MINI|POUCH|BAG|LIPSTICK)(?![A-Z])", "");
const SET_PIECE_SIZE_RE = /^\d*\.?\d+\s*(?:FL\.?\s*)?(?:OZ|ML)?/;
function stripSetPieces(t: string): string {
  let x = String(t).toUpperCase();
  for (let i = 0; i < 40; i++) {
    x = x.replace(/^[\s+]+/, "");
    const m = x.match(SET_PIECE_SIZE_RE) ?? x.match(SET_PIECE_WORD_RE);
    if (!m || !m[0]) break;
    x = x.slice(m[0].length);
  }
  return x.trim();
}
function setTailName(seg: string): string { return stripSetPieces(seg); }

export function identify(input: IdentityInput): Identity {
  const aliases = input.brandAliases ?? EMPTY_ALIASES;
  let s = stripAccents(String(input.description ?? "")).toUpperCase();

  // Classic Wholesale's distribution mark is never part of a name.
  s = s.replace(/\*\s*APPROVED RETAILERS?\s*(?:ONLY)?\s*\*?/g, " ");
  // "NAME by HOUSE" (Classic Wholesale, Gift Express, Al Hussein): the house as printed, read before sizes and types
  // leave the text so it stops where the bottle's size / type / marks begin. Used below only when no known brand is found.
  const byM = s.match(/\sBY\s+([A-Z][A-Z&'.\- ]{1,40}?)\s*(?=\d|\.\d|\(|\*|\b(?:EDP|EDT|EDC|PARFUM|EXTRAIT|COLOGNE|SPR|SPRAY|EAU|FOR)\b|$)/);
  const byHouse = byM && /[A-Z]{3}/.test(byM[1]) && !/^(?:ME|YOU|HER|HIM|NIGHT|DAY|THE SEA)$/.test(byM[1].trim()) ? byM[1].trim() : "";
  // Vendor-internal tails: MTZ "(100028) - Spain - 15pcs ByBox", PCA "(NEW PACK)(ONLY USA)(LI FREE)".
  s = s.replace(/\(\s*\d{4,}\s*\).*$/, " ");
  // Oni Essence prints the bottle size INSIDE parentheses: "ANNICK GOUTAL Songes Wom EDT (100ml)",
  // "VERSACE Pour Homme EDT (100ml+SG 100ml)". Parentheses are dropped below, so the size never read (measured
  // 11-16: 537 of Oni's 1,023 priced lines unlinked). The leading size is moved out in front of the parenthesis.
  s = s.replace(/\(\s*(\d+(?:\.\d+)?\s*(?:ML|OZ)\b)\s*/g, " $1 (");
  // Perfumes Plus: "L- SARAH.J PARKER COVET 3.4 EDP SPR - 13827" — a leading "L-/W-/M-/U-" is the gender and the
  // trailing " - 13827" is the vendor's item number, never part of the name.
  let leadGender: Gender = "";
  // Prefix codes: L-, M-, W-, U- (gender), MS-/LS- (set), MT-/LT- (tester) — with or without a space after the dash.
  let leadFlag = "";
  // Perfumes Plus also writes K- / KS- (kids, kids set), LMS- / MMS- (mini set), LMINI- / MMINI- (mini), MOIL- (oil) — 11-16.
  s = s.replace(/^\s*(L|W|M|U|K)(MS|MINI|OIL|S|T)?\s*-\s*/, (_m, g: string, f?: string) => {
    leadGender = GENDER_WORDS[g] ?? "";
    leadFlag = f === "S" ? "SET" : f === "T" ? "TESTER" : f === "MS" ? "MINI SET" : f === "MINI" ? "MINI" : f === "OIL" ? "OIL" : "";
    return " ";
  });
  s = s.replace(/\s+-\s*\d{3,8}\s*$/, " ");
  // A leading MINI / MINIATURE / VIAL / SAMPLE describes the bottle, not the name: it is a MINI flag, and the brand
  // that follows it is read as the brand ("MINI MARC JACOBS DAISY WILD 4ML", "VIAL MARC JACOBS PERFECT 1.2ML").
  let leadMini = false;
  s = s.replace(/^\s*(?:MINIATURES?|MINIS?|VIALS?|SAMPLES?)\b\s*/, () => { leadMini = true; return " "; });
  // A line that OPENS with what kind of product it is ("TESTER CH GOOD GIRL…", "SET LATTAFA 3PC…", "ROLL ON DKNY GOLD",
  // "BODY MIST WOMEN GUESS BELLA VITA", "KIDS SET WINX…", "DEO STICK BOSS BOTTLED") hides the brand behind it: measured
  // 11-16, hundreds of MOD / MINA DE ORO / UNITED B2B lines read no brand. Those words move to the END of the line, where
  // the flags still read them and the brand leads.
  const leadKinds: string[] = [];
  for (let k = 0; k < 4; k++) {
    const m = s.match(/^\s*(GIFT SET|MINI SET|SET|TESTERS?|TST|KIDS?|ROLL\s?ON|ROLL|ALL OVER BODY SPRAY|ALL OVER SPRAY|BODY MIST|BODY SPRAY|DEOD?\.?\s*STICK|DEO|AFTER SHAVE|DUO|B\/LOTION|B\/L|B\/S|B\/SPRAY|S\/GEL)(?=[\s:\-]|$)[\s:\-]*/);
    if (!m) break;
    leadKinds.push(m[1]); s = s.slice(m[0].length);
    // "BODY MIST WOMEN GUESS …": a gender word right after the kind word is the gender, not the name.
    const g = s.match(/^\s*(WOMEN|WOMAN|MEN|MAN)\b\s*/);
    if (g) { leadKinds.push(g[1]); s = s.slice(g[0].length); }
  }
  if (leadKinds.length) s = `${s} ${leadKinds.join(" ")}`;
  // JIZAN: "AMOUAGE GUIDANCE (U) EDP 100 ml OM" — a 2-letter origin code after the bottle size is the country, not the name.
  s = s.replace(new RegExp(`(\\d\\s*(?:ML|OZ)\\b[^A-Z0-9]*(?:\\([A-Z]\\)\\s*)?)\\b(?:${Object.keys(ISO2_COUNTRY).join("|")})\\s*$`), "$1 ");
  // Competitor lists glue the size to its neighbours ("3.4OZEDT", "BLACK2.7OZ", "3PCSET"): split them so the
  // size, the type and the SET flag are each read (La Esperanza, audit 2026-11-12).
  s = s.replace(/(\d)(OZ|ML)(?=[A-Z])/g, "$1$2 ").replace(/([A-Z])(?=\d+(?:\.\d+)?\s*(?:OZ|ML)\b)/g, "$1 ")
    .replace(/(\d)\s*(PCS?)\s*(SET)\b/g, "$1$2 $3").replace(/(\d)(PCS?)(SET)\b/g, "$1$2 $3");
  // "STRONGER W YOU" / "W/YOU" means WITH YOU, not women.
  s = s.replace(/\bW\/?\s*(?=YOU\b)/g, "WITH ");
  // "TESTER W/CAP", "W/BOX", "W/AIRBAG": W/ is "with" — never Women (measured live 11-14, JIZAN / PPW lines).
  s = s.replace(/\bW\/(?=\s*[A-Z])/g, " ");
  // Brand abbreviations glued to the next word ("JESSICA S.FANCY", "SABRINA C. CHERRY", "RALPH L. ROMANCE",
  // "JUICY C GLISTENING") — spelled out so the brand reads (owner 2026-11-14 18:23 CT, ESPERANZA list).
  s = s.replace(/\bJESSICA S\.\s*/g, "JESSICA SIMPSON ").replace(/\bSABRINA C\.\s*/g, "SABRINA CARPENTER ")
    .replace(/\bRALPH L\.?\s+/g, "RALPH LAUREN ").replace(/^\s*JUICY C\s+/, "JUICY COUTURE ");
  // Vendor shorthand for a body mist ("HEIRESS BMIST 236", "THANK YOU NEXT B.M 236", "B/MIST") and the Spanish
  // spelling "CAPITAN AMERICA" (ESPERANZA list, measured live 11-15) — spelled out so type and name read.
  s = s.replace(/\bB\s*[./]\s*MIST\b|\bBMIST\b|\bB\.\s*M\b\.?|\bB\/M\b/g, " BODY MIST ").replace(/\bCAPITAN\b/g, "CAPTAIN");
  // Flags are read before parentheses are dropped, because PCA writes them as (T), (BOX DAMAGE ONLY).
  const flags = new Set<string>();
  for (const [re, f] of FLAG_RULES) if (re.test(s)) flags.add(f);
  // "GUESS SEDUCTIVE NOIR W 4PCS / BAG": a set that comes in a bag is a SET, not a bag.
  if (flags.has("SET") && flags.has("VARIOUS") && /\b\d\s*PCS?\b/.test(s)) flags.delete("VARIOUS");
  // A set names its main bottle first; the extra pieces follow a "+" ("100% PASSION 3.4 EDT M + 6.7 H/BW + 15ML").
  // The item is the main bottle's name/size/type — the pieces after the first "+ <size>" are not the name.
  const plus = s.search(/\+\s*\d/);
  let contents = "";
  if (plus > 0) {
    flags.add("SET");
    contents = s.slice(plus).replace(/\([^)]*\)?/g, " ").replace(/\s-\s.*$/, "").toUpperCase().replace(/[^A-Z0-9+]/g, "").replace(/^\++|\++$/g, "");
    const head = s.slice(0, plus);
    // La Esperanza writes the pieces FIRST and the fragrance LAST: "3.4EDP+3.4 SHOWER GEL A.GRANDE SWEET LIKE CANDY
    // W 3PC SET", "100ML+10ML DOLCE & GABBANA QUEEN W 3PC SET EDP" (measured live 11-15: 185 lines read no brand).
    // When the part before the first "+ <size>" is only a size / type / piece, the name is what follows the last piece.
    if (!stripSetPieces(head)) {
      const segs = s.slice(plus).split("+");
      const tail = setTailName(segs[segs.length - 1] ?? "");
      // Keep the main bottle's size and type from the head; its piece words (BL, GEL, MINI…) are not the name.
      const headSizeType = head.replace(/\+/g, " ").replace(/\b(?:BL|SGEL|SG|GEL|LOTION|BLOTION|MINI|POUCH|BAG|LIPSTICK)\b/g, " ");
      s = tail ? `${headSizeType} ${tail}` : head;
    } else {
      s = head;
    }
  }

  // Gender from a dedicated column, then (M)/(W)/(U) markers.
  let gender: Gender = "";
  const gcol = cleanSpaces(stripAccents(String(input.gender ?? "")).toUpperCase());
  // A gender column can carry flags too: Nandansons "Item Type" = M, W, W-TSTR, M-SET.
  const gtok = gcol.split(/[^A-Z]+/).filter(Boolean);
  if (gcol) gender = GENDER_WORDS[gcol] ?? GENDER_WORDS[gtok[0] ?? ""] ?? "";
  if (gtok.some((t) => t === "TSTR" || t === "TST" || t === "TESTER")) flags.add("TESTER");
  if (gtok.includes("SET")) flags.add("SET");
  if (!gender && leadGender) gender = leadGender;
  if (leadFlag) for (const f of leadFlag.split(" ")) flags.add(f);
  if (leadMini) flags.add("MINI");
  const paren = s.match(/\((M|W|U|L)[*.]?\)/);
  if (!gender && paren) gender = GENDER_WORDS[paren[1]];
  s = s.replace(/\([^)]*\)/g, " ");
  // A description the vendor cut off inside a parenthesis ("…3PC SET(3.3oz EDT SP, 3.3 Body Cream, 3") leaves an
  // unclosed "(…" — its contents are never the name (audit 2026-11-12, PCA Carven).
  s = s.replace(/\([^)]*$/, " ");

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
  // "VICTORIA'S SECRET" = "VICTORIAS SECRET": an apostrophe never separates two spellings of one word.
  let words = cleanSpaces(s.replace(/'/g, "")).split(" ").filter(Boolean);

  // Brand: the brand column, else the longest known brand or alias the line starts with.
  let brand = canonicalBrand(input.brand ?? "", aliases);
  // Remove the brand's words wherever they lead the line, in any of its spellings. The sorted spelling list is built
  // once per alias set (measured 11-15 02:04Z: rebuilding and sorting ~800 spellings on every line of a 20,000-line
  // rematch kept the API busy past its health check and the instance was restarted).
  const base = spellingsFor(aliases);
  const spellings = brand && !base.has.has(brand) ? [brand.split(" "), ...base.list].sort((a, b) => b.length - a.length) : base.list;
  for (const sp of spellings) {
    if (sp.length && sp.every((w, i) => words[i] === w)) {
      const canon = canonicalBrand(sp.join(" "), aliases);
      if (!brand || brand === canon) { brand = canon; words = words.slice(sp.length); }
      break;
    }
  }
  // No brand leads the line: a multi-word brand INSIDE it ("W/DEO 2.6oz DOLCE & GABBANA "K" M 2PC SET") is its brand,
  // else the fragrance name's own words tell it (NAME_BRAND_HINTS, then the cross-reference of every vendor's items).
  if (!brand) {
    const inside = spellings.filter((sp) => sp.length >= 2).find((sp) => words.some((_, i) => sp.every((w, j) => words[i + j] === w)));
    if (inside) brand = canonicalBrand(inside.join(" "), aliases);
  }
  // One-word brand of the item master anywhere in the line ("3.4oz EDT+3oz GEL+MINI AZZARO CHROME M 3PC SET").
  if (!brand) {
    const one = DESK_BRANDS.find((b) => !b.includes(" ") && b.length >= 4 && words.includes(b));
    if (one) brand = canonicalBrand(one, aliases);
  }
  if (!brand) brand = canonicalBrand(brandFromName(words, input.nameBrands ?? DESK_NAME_BRANDS), aliases);
  // "ENCORE I by LUNICHE 2.7 EDP SPR (M)": no known brand, so the house printed after BY is the brand and leaves the
  // name (measured 11-16: 105 Classic lines read no brand and could not become an item).
  if (byHouse) {
    // Also when the house IS known ("ENCORE I by LUNICHE"): "BY LUNICHE" is never part of the name.
    const hw = cleanSpaces(byHouse.replace(/[^A-Z0-9&' ]+/g, " ").replace(/'/g, "")).split(" ").filter(Boolean);
    const at = words.findIndex((w, i) => w === "BY" && hw.every((h, j) => words[i + 1 + j] === h));
    const house = canonicalBrand(hw.join(" "), aliases);
    if (at >= 0 && (!brand || brand === house)) { brand = house; words = [...words.slice(0, at), ...words.slice(at + 1 + hw.length)]; }
  }
  // A fragrance LINE some vendors write as the brand ("HALLOWEEN BLOSSOM", brand column "HALLOWEEN") belongs to its
  // house, and the line word stays in the name — the item master files it JESUS DEL POZO · HALLOWEEN BLOSSOM
  // (owner 11-14: "halloween is j del pozo"; 13 ESPERANZA lines unmatched under brand HALLOWEEN, measured 11-15).
  const lineHouse = LINE_HOUSE[brand];
  if (lineHouse) {
    const lw = brand.split(" ");
    if (!lw.every((w, i) => words[i] === w)) words = [...lw, ...words];
    brand = canonicalBrand(lineHouse, aliases);
  }
  // A dash after a brand prefix ("GA-AQUA DE GIO") leaves the brand glued on; handled by punctuation step above.
  // Some vendors put the brand INSIDE the line (PCA: "DAISY EAU SO FRESH MARC JACOBS(W)EDT SP 4.2oz"). A brand of two
  // or more words is never part of a fragrance name, so its phrase leaves the name wherever it sits. A one-word brand
  // stays where it is not leading: "MISS DIOR", "BOSS BOTTLED" name the fragrance with the brand word in them.
  if (brand) {
    const own = spellings.filter((sp) => sp.length >= 2 && canonicalBrand(sp.join(" "), aliases) === brand);
    for (const sp of own) {
      for (let i = 1; i + sp.length <= words.length; i++) {
        if (sp.every((w, j) => words[i + j] === w) && words.length > sp.length) { words.splice(i, sp.length); i--; }
      }
    }
  }

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
  // HER / HIM / HIS / HERS inside the name (kept as name words) give the gender when nothing else did.
  if (!gender) gender = genderHintOf(kept.join(" "));
  const sec = readSection(input.section);
  if (!gender) gender = sec.gender;
  for (const f of sec.flags) flags.add(f);

  // COLOGNE names the fragrance when the line already gives its own type ("ETERNITY COLOGNE (M) EDT" ≠ "ETERNITY EDT",
  // audit 2026-11-12); only on a line with no other type is it the type itself.
  const noise = (w: string) => NOISE.has(w) && !(w === "COLOGNE" && conc !== "" && conc !== "EDC");
  const keyWords = kept.filter((w, i) => !(noise(w) && !(i === 0 && KEEP_WHEN_FIRST.has(w))) && w !== ".");
  // What the owner sees keeps a name's own EAU ("DAISY EAU SO FRESH", "CHANCE EAU TENDRE"); the concentration
  // phrases (EAU DE PARFUM / TOILETTE / COLOGNE) were already removed above. The KEY still drops it, so a vendor
  // that writes "DAISY SO FRESH" is the same bottle.
  const shownWords = kept.filter((w, i) => (w === "EAU" || !(noise(w) && !(i === 0 && KEEP_WHEN_FIRST.has(w)))) && w !== ".");
  // Same word, different spelling (owner 2026-11-12: "ck b might also be ck bee, and ck one might also show up
  // as ck 1"). The KEY uses the one spelling; what the owner sees keeps the vendor's own words.
  // The item master files some names with the house trailing or glued ("IDOLE LANCOME", "ED HARDY LOVE&LUCK",
  // "FRENCH PANACHE S" — S = spray); vendors write "LANCOME IDOLE", "LOVE LUCK" (measured live 11-15: score-1 review
  // lines held only by "name differs"). The KEY drops a trailing one-word house, a trailing lone S, and splits X&Y.
  let kw = keyWords.flatMap((w) => (/^[A-Z0-9]+&[A-Z0-9]+$/.test(w) ? w.split("&") : [w]));
  if (kw.length >= 2 && kw[kw.length - 1] === "S") kw = kw.slice(0, -1);
  if (brand && !brand.includes(" ") && kw.length >= 2 && kw[kw.length - 1] === brand && kw.slice(0, -1).some((w) => !GENERIC_NAME_WORDS.has(w))) kw = kw.slice(0, -1);
  const nameWords = kw.map((w) => SAME_NAME_WORD[w] ?? w);
  if (sizeMl != null && sizeMl <= 15 && !flags.has("SET")) flags.add("MINI");

  const flagList = [...flags].sort();
  // A brand-only product ("4711 EAU DE COLOGNE") has no name words: it is shown and matched by its brand.
  const nameText = shownWords.length ? shownWords.join(" ") : brand;
  const key = [brand || "?", nameWords.join(" "), sizeMl ?? "?", conc || "?", gender || "?", flagList.join("+")].join("|");
  return { brand, nameWords, sizeMl, conc, gender, flags: flagList, key: contents ? `${key}|${contents}` : key, nameText, contents };
}

/**
 * Brand-free key — for lists that name items without a brand (La Esperanza, Clásica): "212 SEXY W 3.4oz".
 * Two lines with the same loose key are the same bottle only if neither side names a DIFFERENT brand.
 */
export function looseKey(id: Identity): string {
  const k = [id.nameWords.join(" "), id.sizeMl ?? "?", id.conc || "?", id.gender || "?", id.flags.join("+")].join("|");
  return id.contents ? `${k}|${id.contents}` : k;
}

/** Normalized UPC: digits only, leading zeros dropped, at least 8 digits; anything else is not a UPC. */
export function normalizeUpc(v: unknown): string {
  let s = String(v ?? "").trim();
  s = s.replace(/\.0+$/, "");
  if (/^\d+(\.\d+)?e\+\d+$/i.test(s)) s = BigInt(Math.round(Number(s))).toString();
  // Strip the leading zeros FIRST, then check the length: a vendor code printed in the UPC column
  // (POTW "BODY000000015", B&S "TEST000020.W.3.4") has 9-10 digits but only "15"/"2034" once the zeros go, and
  // perfume.item_upcs only accepts ^[1-9][0-9]{7,13}$ — checking before the strip let it through and 500'd the
  // whole B&S import (11-16) on item_upcs_upc_check.
  const d = s.replace(/\D/g, "").replace(/^0+/, "");
  if (d.length < 8 || d.length > 14) return "";
  return d;
}

/* ---------------- vendor line ending ---------------- */

/** 2-letter origin codes vendors print after the bottle size (JIZAN "... 100 ml OM"). */
export const ISO2_COUNTRY: Record<string, string> = {
  OM: "Oman", US: "USA", FR: "France", AE: "United Arab Emirates", ES: "Spain", IT: "Italy", GB: "United Kingdom",
  UK: "United Kingdom", DE: "Germany", CN: "China", CH: "Switzerland", IN: "India", PL: "Poland", BR: "Brazil",
  NL: "Netherlands", JP: "Japan", KR: "South Korea", MX: "Mexico", CA: "Canada", TR: "Turkey", SA: "Saudi Arabia",
  BE: "Belgium", AT: "Austria", IE: "Ireland", MC: "Monaco", PT: "Portugal", GR: "Greece", BG: "Bulgaria", CZ: "Czechia",
};

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
  // The box count is ONLY a line that ENDS in the MTZ form "- 12pcs ByBox" (or "- 12pcs"). A "- 2 Pc 11.8oz Hand
  // Lotion" inside a description is the pieces of a set, never a box (PCA row 1481, audit 2026-11-12).
  const pcs = last.match(/^(\d+)\s*pcs?(?:\s*by\s*box)?\s*$/i);
  const code = segs[0]?.match(/\(\s*(\d{4,})\s*\)\s*$/)?.[1] ?? s.match(/\(\s*(\d{5,8})\s*\)/)?.[1] ?? null;
  if (segs.length < 2 || !pcs) {
    // JIZAN: origin code right after the size ("... 100 ml OM", "... 100 ml (D) OM").
    const iso = s.match(/\d\s*(?:ml|oz)\b[^A-Za-z0-9]*(?:\([A-Za-z]\)\s*)?\b([A-Z]{2})\s*$/i)?.[1]?.toUpperCase();
    const itemNo = s.match(/\s-\s*(\d{3,8})\s*$/)?.[1] ?? null;
    return { code: code ?? itemNo, country: iso && ISO2_COUNTRY[iso] ? ISO2_COUNTRY[iso] : null, casePack: null };
  }
  const raw = segs.slice(1, -1).map((x) => x.trim()).find((x) => /^[A-Za-z][A-Za-z .'&]*$/.test(x)) ?? null;
  const country = raw ? (COUNTRY_FIX[raw.toUpperCase()] ?? raw.replace(/\s+/g, " ")) : null;
  return { code, country, casePack: Number(pcs[1]) };
}

/**
 * The owner's category for an item (owner 2026-11-12): Women, Men, Unisex, Set Women, Set Men, Set Unisex,
 * Tester Women, Tester Men, Tester Unisex, Cosmetics (lotion, gel, deodorant, cream, makeup …), Various
 * (blotters, bags, backpacks …). Fragrance categories follow the gender; a missing gender says "Unknown".
 */
export function categoryOf(gender: string | null | undefined, flags: readonly string[] | string | null | undefined): string {
  const f = new Set(Array.isArray(flags) ? flags : String(flags ?? "").split(/[\s,+]+/).filter(Boolean));
  if (f.has("VARIOUS")) return "Various";
  if (f.has("BODY")) return "Cosmetics";
  const g = gender === "W" ? "Women" : gender === "M" ? "Men" : gender === "U" ? "Unisex" : "Unknown";
  if (f.has("SET")) return `Set ${g}`;
  if (f.has("TESTER")) return `Tester ${g}`;
  return g;
}
