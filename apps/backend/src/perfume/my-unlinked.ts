/**
 * PERFUME-DESK — "Match my list ↔ competitor" (owner 2026-11-13 night: "over 300 items … not correctly mapped — have a
 * review of my list so i can map"; 2026-11-14: "showing my description name and la esperanza description name … so i
 * can verify they are matched correctly").
 *
 * For each item on my offer list that has NO competitor line linked, the competitor lines it most likely is, best
 * first. Pure — no database, never links anything: the owner links each one himself (confirmRow).
 *
 * A competitor line is proposed for my item when:
 *  - the brand does not conflict (both known and different = never);
 *  - SET / TESTER / MINI agree, and Men vs Women do not conflict (unisex / unknown never conflicts);
 *  - at least half of my item's name words (noise words dropped) are on the line, and at least one of them is a
 *    distinctive word (3+ letters).
 * Score = share of my name words found, lowered when the size or type differs or the line names extra words; every
 * reason is written out so the owner can see why it was proposed.
 */
import { sizesFar, type Identity } from "./normalize.js";
import { genderCheck, lineGender, nameKeyWords, type OfferItem } from "./offer-review.js";

export type CompetitorLine = { row_id: string; vendor: string; description: string; price_cents: number; linked_to: string | null; id: Identity };
export type LineCandidate = { row_id: string; vendor: string; description: string; price_cents: number; score: number; why: string; linked_to: string | null };

const NOISE = new Set(["DE", "DU", "LE", "LA", "LES", "THE", "BY", "FOR", "OF", "AND", "&", "EAU", "POUR", "A"]);
const GENDER_WORDS = new Set(["M", "W", "U", "MAN", "MEN", "MENS", "WOMAN", "WOMEN", "WOMENS", "HOMME", "FEMME", "UNISEX", "LADIES", "LADY"]);
const KIND_FLAGS = ["SET", "TESTER", "MINI", "REFILL"];
const words = (s: string) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9&]+/g, " ").split(/\s+/).filter(Boolean);
const kind = (flags: readonly string[]) => KIND_FLAGS.filter((f) => flags.includes(f)).join(",");

/** Each competitor line's words, read once per pool (not once per my item × line). */
type PreparedLine = { lw: Set<string>; lc: string; kind: string; gender: string; extrasPool: string[] };
type LinesIndex = { prepared: PreparedLine[]; byBrand: Map<string, number[]>; byWord: Map<string, number[]> };
const linesIndexCache = new WeakMap<readonly CompetitorLine[], LinesIndex>();
/** Speed (owner 2026-11-16 14:01 CT "i need this to work fast"; the List-analysis grid measured 103 s live): every item of
 *  mine was compared with every competitor line (now 42,000+ lines across 34 lists). A line is only proposed when it
 *  carries my item's brand (the same brand read, or one of my brand words on the line), so only those lines are compared,
 *  in the pool's own order — the same candidates, the same order, the same scores. */
function linesIndex(lines: readonly CompetitorLine[]): LinesIndex {
  const hit = linesIndexCache.get(lines);
  if (hit) return hit;
  const byBrand = new Map<string, number[]>();
  const byWord = new Map<string, number[]>();
  const prepared = lines.map((ln, i) => {
    const id = ln.id;
    const lw = new Set([...words(ln.description), ...id.nameWords.flatMap(words), ...words(id.brand)]);
    if (id.brand) (byBrand.get(id.brand) ?? byBrand.set(id.brand, []).get(id.brand)!).push(i);
    for (const w of lw) (byWord.get(w) ?? byWord.set(w, []).get(w)!).push(i);
    return { lw, lc: [...lw].join(" ").replace(/\s+/g, "") + words(ln.description).join(""), kind: kind(id.flags), gender: lineGender(ln.description, id.gender),
      extrasPool: [...new Set(id.nameWords.flatMap(words))] };
  });
  const ix = { prepared, byBrand, byWord };
  linesIndexCache.set(lines, ix);
  return ix;
}

export function likelyLines(item: OfferItem, lines: readonly CompetitorLine[], max = 5): LineCandidate[] {
  const need = nameKeyWords(item.name);
  if (!need.length) return [];
  const brandWords = words(item.brand).filter((w) => w.length >= 3 && !NOISE.has(w));
  const out: LineCandidate[] = [];
  const ix = linesIndex(lines);
  const pick = new Set<number>(item.brand ? (ix.byBrand.get(item.brand) ?? []) : []);
  for (const w of brandWords) for (const i of ix.byWord.get(w) ?? []) pick.add(i);
  const itemKind = kind(item.flags);
  const needJoined = need.join("");
  const mine = new Set([...need, ...words(item.name), ...words(item.brand)]);
  for (const i of [...pick].sort((a, b) => a - b)) {
    const ln = lines[i];
    const id = ln.id;
    const { lw, lc, kind: lineKind, gender, extrasPool } = ix.prepared[i];
    if (id.brand && item.brand && id.brand !== item.brand) continue;
    if (lineKind !== itemKind) continue;
    const gc = genderCheck(gender, item.gender, item.name);
    if (!gc.ok) continue;
    // Spacing typos: "LOVEME" on the line covers my LOVE + ME (owner 19:03 CT).
    const hit = need.filter((w) => lw.has(w) || (needJoined.length > 4 && lc.includes(needJoined)));
    if (hit.length * 2 < need.length || !hit.some((w) => w.length >= 3)) continue;
    const brandSeen = Boolean(id.brand && id.brand === item.brand) || brandWords.some((w) => lw.has(w));
    // Owner 2026-11-14 17:34 CT: "IT MUST BE FROM SAME BRAND" — a line without my item's brand is never proposed.
    if (!brandSeen) continue;
    const extras = extrasPool.filter((w) => !mine.has(w) && !NOISE.has(w) && !GENDER_WORDS.has(w) && !needJoined.includes(w));
    const missing = need.filter((w) => !lw.has(w));
    if (sizesFar(id.sizeMl, item.size_ml)) continue;
    const sizeDiffers = id.sizeMl != null && item.size_ml != null && Math.abs(id.sizeMl - item.size_ml) > 5;
    const concDiffers = Boolean(id.conc && item.conc && id.conc !== item.conc);
    const score = Math.round(gc.factor * (hit.length / need.length) * (brandSeen ? 1 : 0.85) * (sizeDiffers ? 0.7 : 1) * (concDiffers ? 0.8 : 1) * (extras.length ? 0.75 : 1) * 100) / 100;
    const why = [
      brandSeen ? "brand on the line" : "no brand on the line",
      `${hit.length}/${need.length} name words`,
      ...(missing.length ? [`missing: ${missing.join(" ")}`] : []),
      ...(extras.length ? [`EXTRA WORDS: ${extras.join(" ")}`] : []),
      sizeDiffers ? `SIZE DIFFERS: line ${id.sizeMl} ml, mine ${item.size_ml} ml` : id.sizeMl != null && item.size_ml != null ? `size ${item.size_ml} ml` : "size not compared",
      ...(concDiffers ? [`TYPE DIFFERS: line ${id.conc}, mine ${item.conc}`] : []),
      gc.note,
      ...(ln.linked_to ? [`now linked to: ${ln.linked_to}`] : []),
    ].join(" · ");
    out.push({ row_id: ln.row_id, vendor: ln.vendor, description: ln.description, price_cents: ln.price_cents, score, why, linked_to: ln.linked_to });
  }
  return out.sort((a, b) => b.score - a.score || a.description.localeCompare(b.description)).slice(0, max);
}
