import { entityLabel } from "./entity-label";

/**
 * Register rows 223 / 225 / 229 / 231 (D047 / D049 / D053 / D055) — company / customer / vendor names render in
 * proper case on screen: "ACME FREIGHT LLC" → "Acme Freight LLC", "TRANSPORTES GARZA SA DE CV" →
 * "Transportes Garza SA DE CV". The companion of formatPersonName (people) for organisations. THE ONE org-casing
 * function — every org name on screen (customers, vendors, cash-flow payees, factoring debtors) goes through it.
 *
 * Owner org-casing rule 443.266-A ("org acronym stays ACME — customer/vendor/org names render as entered") + live
 * FAILs 11-03 rows 223 / 225 / 229:
 *   · legal suffixes keep their canonical case (LLC, INC, LP, LLP, PLLC, LTD, DBA, SA, CV, RL, SRL …) — also repairs
 *     a write-time "Llc" / "Inc" back to "LLC" / "INC", and a suffix glued after a comma ("Logistics,Llc") is still
 *     recognised (rendered "Logistics, LLC");
 *   · "DE" stays upper only inside a Mexican suffix ("SA DE CV", "S. DE R.L."), so "De La Cruz" is untouched;
 *   · a short ALL-CAPS token from the source STAYS upper — it is an acronym ("FLS", "IND", "XPR", "MPH"). In a name
 *     typed in mixed case, an all-caps token of up to 4 letters is kept ("ACME Freight"); in a name typed entirely
 *     in caps (where shouting hides the acronyms), tokens of up to 3 letters are kept, common words excepted
 *     ("DE LA", "THE", "AND", "CO"); a one-word name is kept as typed ("ACME");
 *   · a word typed in real camel case that starts with a capital ("McAllen", "FedEx") is kept as typed; a broken
 *     hybrid that starts lower-case ("loGISTICS") is normalised to "Logistics" — never a lower-then-caps hybrid;
 *   · a word carrying a digit is kept as typed, except a short all-letters-one-case code ("2ems" → "2EMS",
 *     "3pl" → "3PL"); ordinals ("1st") are left alone.
 * DISPLAY ONLY — never use it to rewrite stored data or an API payload.
 */
const KEEP_UPPER = new Set([
  "LLC",
  "INC",
  "LP",
  "LLP",
  "PLLC",
  "LTD",
  "DBA",
  "USA",
  "SA",
  "CV",
  "RL",
  "SRL",
  "SAPI",
  "USMCA",
  "IH",
]);
const MX_SUFFIX_AFTER_DE = new Set(["CV", "RL", "SRL"]);
/** Common words that are NOT acronyms when a whole name is typed in caps. */
const COMMON_WORDS = new Set([
  "A", "AN", "THE", "AND", "OF", "FOR", "TO", "AT", "ON", "IN", "BY", "OR", "CO",
  "DE", "DEL", "LA", "LAS", "LOS", "EL", "Y", "E", "SAN", "SUR", "NOR",
  "BIG", "NEW", "ONE", "TWO", "TOP", "ALL", "OUR", "RED", "SUN", "BAY", "WAY", "AIR", "SEA", "OIL", "GAS", "CAR", "BUS", "VAN",
]);

function bare(word: string): string {
  return word.replace(/[.,()]/g, "").toUpperCase();
}

function letters(word: string): string {
  return word.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü]/g, "");
}

function titleCase(word: string): string {
  return word
    .toLowerCase()
    .replace(/(^|[-'/&(.])([a-záéíóúñü])/g, (_m, sep: string, ch: string) => `${sep}${ch.toUpperCase()}`);
}

/** Real camel case typed on purpose: starts with a capital, then lower, then another capital ("McAllen", "FedEx"). */
function isDeliberateCamel(word: string): boolean {
  const l = letters(word);
  return /^[A-ZÁÉÍÓÚÑÜ][a-záéíóúñü]+[A-ZÁÉÍÓÚÑÜ][A-Za-záéíóúñüÁÉÍÓÚÑÜ]*$/.test(l) && /[a-z][A-Z]/.test(l) && !/[A-Z]{2}/.test(l);
}

interface Ctx {
  next: string | undefined;
  allCaps: boolean;
  single: boolean;
}

function companyWord(word: string, ctx: Ctx): string {
  if (!word) return word;
  const b = bare(word);
  if (KEEP_UPPER.has(b)) return word.toUpperCase();
  if (b === "DE" && ctx.next !== undefined && MX_SUFFIX_AFTER_DE.has(bare(ctx.next))) return word.toUpperCase();
  const l = letters(word);
  if (/\d/.test(word)) {
    if (/^\d+(st|nd|rd|th)$/i.test(word)) return word;
    const oneCase = l === l.toUpperCase() || l === l.toLowerCase();
    if (l.length >= 1 && l.length <= 4 && oneCase && /^[\dA-Za-z-]+$/.test(word)) return word.toUpperCase();
    return word;
  }
  if (l === "") return word;
  const isUpper = l === l.toUpperCase() && l !== l.toLowerCase();
  if (isUpper) {
    if (ctx.single) return word;
    if (COMMON_WORDS.has(b)) return titleCase(word);
    const limit = ctx.allCaps ? 3 : 4;
    if (l.length >= 2 && l.length <= limit) return word;
    return titleCase(word);
  }
  if (isDeliberateCamel(word)) return word;
  return titleCase(word);
}

export function formatCompanyName(value: unknown): string {
  const raw = String(value ?? "")
    .trim()
    // a legal suffix glued after a comma ("Logistics,Llc") is its own word
    .replace(/,(?=\S)/g, ", ")
    .replace(/\s+/g, " ");
  if (!raw) return "";
  const words = raw.split(" ");
  const all = letters(raw);
  const allCaps = all !== "" && all === all.toUpperCase() && all !== all.toLowerCase();
  const single = words.length === 1;
  return words.map((w, i) => companyWord(w, { next: words[i + 1], allCaps, single })).join(" ");
}

/**
 * entityLabel() for an organisation (customer / vendor / debtor / company): same honest fallbacks
 * ("Customer — not visible", "Unassigned", uuid / JSON rejection), and a resolved name is proper-cased
 * through formatCompanyName.
 */
export function companyLabel(name: unknown, id?: unknown, noun = "Customer"): string {
  const label = entityLabel(name, id, noun);
  const raw = name == null ? "" : String(name).trim();
  return raw !== "" && label === raw ? formatCompanyName(raw) : label;
}
