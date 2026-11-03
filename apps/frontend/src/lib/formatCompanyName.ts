import { entityLabel } from "./entity-label";

/**
 * Register rows 223 / 225 / 229 / 231 (D047 / D049 / D053 / D055) — company / customer / vendor names render in
 * proper case on screen: "ACME FREIGHT LLC" → "Acme Freight LLC", "TRANSPORTES GARZA SA DE CV" →
 * "Transportes Garza SA DE CV". The companion of formatPersonName (people) for organisations:
 *   · legal suffixes and acronyms stay UPPER (LLC, INC, LP, LLP, PLLC, LTD, DBA, USA, SA, CV, RL, SRL, USMCA, IH)
 *     — also repairs a write-time "Llc" / "Inc" back to "LLC" / "INC";
 *   · "DE" stays upper only inside a Mexican suffix ("SA DE CV", "S. DE R.L."), so "De La Cruz" is untouched;
 *   · a word typed in real mixed case ("McAllen", "FedEx") is kept as typed;
 *   · a word carrying a digit ("3PL", "IH35", "I-35") is kept as typed.
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
  "USMCA",
  "IH",
]);
const MX_SUFFIX_AFTER_DE = new Set(["CV", "RL", "SRL"]);

function bare(word: string): string {
  return word.replace(/[.,]/g, "").toUpperCase();
}

function companyWord(word: string, next: string | undefined): string {
  if (!word) return word;
  const b = bare(word);
  if (KEEP_UPPER.has(b)) return word.toUpperCase();
  if (b === "DE" && next !== undefined && MX_SUFFIX_AFTER_DE.has(bare(next))) return word.toUpperCase();
  if (/\d/.test(word)) return word;
  const isMixed =
    word !== word.toUpperCase() && word !== word.toLowerCase() && word.slice(1) !== word.slice(1).toLowerCase();
  if (isMixed) return word;
  return word
    .toLowerCase()
    .replace(/(^|[-'/&(.])([a-záéíóúñü])/g, (_m, sep: string, ch: string) => `${sep}${ch.toUpperCase()}`);
}

export function formatCompanyName(value: unknown): string {
  const raw = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!raw) return "";
  const words = raw.split(" ");
  return words.map((w, i) => companyWord(w, words[i + 1])).join(" ");
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
