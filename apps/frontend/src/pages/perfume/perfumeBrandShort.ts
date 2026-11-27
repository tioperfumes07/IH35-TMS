/**
 * Owner 2026-11-27 15:47 CT: "large brands can be abbreviated paco rabanne, can be Paco R. dolce and gabbana can be D&G,
 * jean paul can be JPG, etc." Display only: the item keeps its full brand, the filter, search and Excel export use the full
 * name, and the cell shows the full name on hover. Keys are the item master's own spellings, measured on prod 11-27 (the
 * largest brands by item count); where vendors already use a short form (normalize.ts BUILTIN_BRAND_ALIASES: CH, CK, YSL,
 * ADP, D&G, JPG) that short form is used.
 */
export const BRAND_SHORT: Readonly<Record<string, string>> = {
  "PACO RABANNE": "Paco R.",
  "DOLCE & GABBANA": "D&G",
  "DOLCE GABBANA": "D&G",
  "JEAN PAUL GAULTIER": "JPG",
  "CAROLINA HERRERA": "CH",
  "CALVIN KLEIN": "CK",
  "YVES SAINT LAURENT": "YSL",
  "GIORGIO ARMANI": "Armani",
  "ACQUA DI PARMA": "ADP",
  "ELIZABETH ARDEN": "E. Arden",
  "ELIZABETH TAYLOR": "E. Taylor",
  "SALVATORE FERRAGAMO": "Ferragamo",
  "MAISON FRANCIS KURKDJIAN": "MFK",
  "PARFUMS DE MARLY": "PDM",
  "NARCISO RODRIGUEZ": "Narciso R.",
  "TOMMY HILFIGER": "Tommy H.",
  "ABERCROMBIE & FITCH": "A&F",
  "ANTONIO BANDERAS": "A. Banderas",
  "OSCAR DE LA RENTA": "Oscar R.",
  "VICTORIAS SECRET": "Victoria's S.",
};

/** The brand as the grid shows it: the short form for a large brand, else the brand as written. */
export function brandShort(brand: string): string {
  return BRAND_SHORT[brand.trim().toUpperCase()] ?? brand;
}
