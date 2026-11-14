/** Review: does the item a line of mine is filed under say something my own wording does not? (owner 2026-11-14) */
const FILLER = new Set(["ML", "OZ", "EDT", "EDP", "EDC", "PARFUM", "MEN", "WOMEN", "UNISEX", "M", "W", "U", "SP", "SPRAY", "THE", "DE", "LA", "LE", "POUR", "FOR", "EAU"]);
/** Words of the item's name that my own wording does not carry (abbreviations count: "AZZ" covers "AZZARO", "WTD"
 *  covers "WANTED"); the size must match too. Null when my wording already says it all. */
export function itemSaysMore(mine: string, item: string): string | null {
  const w = (t: string) => t.toUpperCase().replace(/[^A-Z0-9]+/g, " ").split(" ").filter(Boolean);
  const myWords = w(mine);
  const sizeOf = (t: string) => /(\d+(?:\.\d+)?)\s*ML/.exec(t.toUpperCase().replace(/\s+/g, ""))?.[1] ?? null;
  const covers = (iw: string) => myWords.some((m) => m === iw || (m.length >= 3 && iw.startsWith(m)) || (iw.length >= 4 && [...m].every((ch) => iw.includes(ch)) && m[0] === iw[0]));
  const missing = w(item.replace(/·/g, " ")).filter((iw) => !FILLER.has(iw) && !/^\d/.test(iw) && !covers(iw));
  const sizeClash = sizeOf(mine) && sizeOf(item) && sizeOf(mine) !== sizeOf(item) ? [`${sizeOf(item)} ml`] : [];
  // A kind word on my line that the item does not carry (REFILL, TESTER, SET, MINI) is a different product.
  const itemWords = new Set(w(item));
  const kindClash = ["REFILL", "TESTER", "SET", "MINI"].filter((k) => myWords.includes(k) !== itemWords.has(k)).map((k) => (myWords.includes(k) ? `mine says ${k}` : `item says ${k}`));
  const out = [...missing, ...sizeClash, ...kindClash];
  return out.length ? out.join(" ") : null;
}

