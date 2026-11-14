/**
 * PERFUME-DESK — Review narrowed to MY OFFER LIST (owner 2026-11-13: "just show all the items from my list and
 * i'll confirm each. in review but only for my list").
 *
 * For every vendor / competitor line still waiting in Review, find the items on the owner's offer list it can be.
 * Pure — no database. Never links anything: it only PROPOSES; the owner confirms each line (confirmRow).
 *
 * A line is a candidate for an offer item when ALL of these hold:
 *  - every word of the item's name (noise words like DE / LE / THE dropped) appears in the line, and the line names
 *    no word my item does not (gender words aside) — an extra word is a different bottle (INTENSE, BLOSSOM, ROSE);
 *  - the brand agrees: the line names the same brand, or names none we know — a line without the item's brand
 *    needs at least 2 name words ("HALLOWEEN HERO"), never one ("BLUE");
 *  - the bottle size: agreeing within 5 ml scores high; a different size is still proposed, scored lower, both sizes named;
 *  - SET / TESTER / MINI agree (a 4-piece set is never the 100 ml bottle);
 *  - EDT / EDP / PARFUM differing is proposed, scored lower, and named ("TYPE DIFFERS").
 */
import type { Identity } from "./normalize.js";

export type OfferItem = { id: string; brand: string; name: string; size_ml: number | null; conc?: string | null; gender?: string | null; flags: string[]; display_name: string };
export type OfferCandidate = { item_id: string; display_name: string; score: number; why: string };

const NOISE = new Set(["DE", "DU", "LE", "LA", "LES", "THE", "BY", "FOR", "OF", "AND", "&", "EAU", "POUR", "A"]);
const KIND_FLAGS = ["SET", "TESTER", "MINI"];
/** Gender words a vendor adds to a name ("CH MEN", "GOD IS A WOMAN") — never a different product. */
const GENDER_WORDS = new Set(["M", "W", "U", "MAN", "MEN", "MENS", "WOMAN", "WOMEN", "WOMENS", "HOMME", "FEMME", "UNISEX", "LADIES"]);

function words(s: string): string[] {
  return String(s ?? "").toUpperCase().replace(/[^A-Z0-9&]+/g, " ").split(/\s+/).filter(Boolean);
}

export function nameKeyWords(name: string): string[] {
  const w = words(name);
  const kept = w.filter((x) => !NOISE.has(x));
  return kept.length ? kept : w;
}

function kindFlags(flags: readonly string[]): string {
  return KIND_FLAGS.filter((f) => flags.includes(f)).join(",");
}

export function offerCandidates(line: { description: string; brand: string | null }, id: Identity, items: readonly OfferItem[], max = 3): OfferCandidate[] {
  const lineWords = new Set([...words(line.description), ...words(line.brand ?? ""), ...id.nameWords.flatMap(words), ...words(id.brand)]);
  const lineKind = kindFlags(id.flags);
  const out: OfferCandidate[] = [];
  for (const it of items) {
    const need = nameKeyWords(it.name);
    if (!need.length || !need.every((w) => lineWords.has(w))) continue;
    if (id.brand && it.brand && id.brand !== it.brand) continue;
    const brandWords = words(it.brand).filter((w) => w.length >= 3 && !NOISE.has(w));
    const brandSeen = id.brand === it.brand || brandWords.some((w) => lineWords.has(w));
    // A brand-less line must carry a distinctive name: 2+ words ("HALLOWEEN HERO"), never one word ("BLUE").
    if (!brandSeen && need.length < 2) continue;
    // Size: proposed even when it differs (vendors round 105 / 110 ml to "3.4oz") but scored lower and both sizes
    // shown; the owner decides.
    const sizeDiffers = id.sizeMl != null && it.size_ml != null && Math.abs(id.sizeMl - it.size_ml) > 5;
    if (lineKind !== kindFlags(it.flags)) continue;
    // Men's and women's bottles are different products; unisex or unknown on either side is not a conflict.
    if (id.gender && it.gender && id.gender !== "U" && it.gender !== "U" && id.gender !== it.gender) continue;
    // A name word the line has and my item does not is a DIFFERENT bottle (measured live 11-13 on ESPERANZA:
    // WANTED vs WANTED INTENSE, HER vs HER BLOSSOM, GOOD GIRL vs GOOD GIRL BLUSH, 212 VIP vs 212 VIP ROSE) — not
    // proposed. Gender words and noise words do not count.
    const itemAll = new Set([...need, ...words(it.brand), ...words(it.name)]);
    const extras = [...new Set(id.nameWords.flatMap(words))].filter((w) => !itemAll.has(w) && !NOISE.has(w) && !GENDER_WORDS.has(w));
    if (extras.length) continue;
    const sizeOk = id.sizeMl != null && it.size_ml != null;
    // Type (EDT / EDP / PARFUM / EXTRAIT) differing is usually a different bottle: proposed, scored lower, named.
    const concDiffers = Boolean(id.conc && it.conc && id.conc !== it.conc);
    const score = Math.round(Math.min(1, (concDiffers ? 0.7 : 1) * (sizeDiffers ? 0.7 : 1) * (brandSeen ? 1 : 0.9) * (sizeOk ? 1 : 0.95)) * 100) / 100;
    const why = [brandSeen ? "brand + name words match" : "name words match (no brand on the line)",
      sizeDiffers ? `SIZE DIFFERS: line ${id.sizeMl} ml, your item ${it.size_ml} ml` : sizeOk ? `size ${it.size_ml} ml` : "size not on the line",
      ...(concDiffers ? [`TYPE DIFFERS: line ${id.conc}, your item ${it.conc}`] : [])].join(" · ");
    out.push({ item_id: it.id, display_name: it.display_name, score, why });
  }
  return out.sort((a, b) => b.score - a.score || a.display_name.localeCompare(b.display_name)).slice(0, max);
}
