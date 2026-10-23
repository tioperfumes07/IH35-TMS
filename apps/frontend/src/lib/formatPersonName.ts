/**
 * Owner ruling (10-22, 443.257-B / 443.258-B class N): a person's name renders in proper case everywhere —
 * "HUGO GAYTAN" → "Hugo Gaytan", "Vicente Santos contreras" → "Vicente Santos Contreras" — never ALL CAPS,
 * never initials, never an id. A word typed in real mixed case ("McAllen", "DeLeon") is kept as typed.
 */
const KEEP_UPPER = new Set(["II", "III", "IV", "JR", "SR"]);

function properWord(word: string): string {
  if (!word) return word;
  const bare = word.replace(/\./g, "").toUpperCase();
  if (KEEP_UPPER.has(bare)) return bare === "JR" || bare === "SR" ? `${bare[0]}${bare.slice(1).toLowerCase()}${word.endsWith(".") ? "." : ""}` : bare;
  const isMixed = word !== word.toUpperCase() && word !== word.toLowerCase() && word.slice(1) !== word.slice(1).toLowerCase();
  if (isMixed) return word;
  // Hyphenated and apostrophe parts each get a capital: "PEREZ-GARCIA" → "Perez-Garcia", "O'NEIL" → "O'Neil".
  return word
    .toLowerCase()
    .replace(/(^|[-'])([a-záéíóúñü])/g, (_m, sep: string, ch: string) => `${sep}${ch.toUpperCase()}`);
}

export function formatPersonName(value: unknown): string {
  const raw = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!raw) return "";
  return raw.split(" ").map(properWord).join(" ");
}
