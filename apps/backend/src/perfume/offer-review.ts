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
import { genderHintOf, sizesFar, type Identity } from "./normalize.js";

export type OfferItem = { id: string; brand: string; name: string; size_ml: number | null; conc?: string | null; gender?: string | null; flags: string[]; display_name: string };
export type OfferCandidate = { item_id: string; display_name: string; score: number; why: string };

const NOISE = new Set(["DE", "DU", "LE", "LA", "LES", "THE", "BY", "FOR", "OF", "AND", "&", "EAU", "POUR", "A"]);
const KIND_FLAGS = ["SET", "TESTER", "MINI", "REFILL"];
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

const MEN_WORDS = new Set(["MEN", "MENS", "MAN", "HOMME"]);
const WOMEN_WORDS = new Set(["WOMEN", "WOMENS", "WOMAN", "FEMME", "LADIES", "LADY"]);
/** The line's gender: the import engine's reading, else the vendor's own spelled-out word ("CH MEN", "CH WOMEN" —
 *  measured live 11-13 on ESPERANZA: identify() reads MEN / WOMEN as the NAME, gender empty, so CH WOMEN was paired with
 *  my CH Men). Both words, or neither, means unknown — never guessed. */
export function lineGender(description: string, idGender: string | null | undefined): string {
  if (idGender) return idGender;
  const w = words(description);
  const m = w.some((x) => MEN_WORDS.has(x));
  const f = w.some((x) => WOMEN_WORDS.has(x));
  return m && !f ? "M" : f && !m ? "W" : "";
}

const GENDER_NAME: Record<string, string> = { M: "Men", W: "Women", U: "Unisex" };
/** The gender rule every recommendation uses (owner 2026-11-14 17:22 CT: "LIGHT BLUE MAN I MATCHED BY ACCIDENT TO
 *  LIGHT BLUE WOMAN … WHY IS IT RECOMMENDING FROM OTHER GENDERS"). An item with no gender filed still has the one its
 *  name says (HER / POUR HOMME). Men vs Women = never proposed. Unisex beside Men or Women = proposed, named. When
 *  either side does not say, the bottle is proposed ranked well below, and the reason says so plainly — Light Blue
 *  exists for men and for women, so an unstated gender is never passed off as a match. */
export function genderCheck(lineG: string | null | undefined, itemG: string | null | undefined, itemName = ""): { ok: boolean; factor: number; note: string } {
  const l = lineG || "";
  const i = itemG || genderHintOf(itemName) || "";
  if (l && i && l !== "U" && i !== "U" && l !== i) return { ok: false, factor: 0, note: `GENDER: line ${GENDER_NAME[l]}, item ${GENDER_NAME[i]}` };
  if (l && i && l === i) return { ok: true, factor: 1, note: `gender ${GENDER_NAME[i]} = ${GENDER_NAME[l]}` };
  if (l && i) return { ok: true, factor: 0.85, note: `GENDER: line ${GENDER_NAME[l]}, item ${GENDER_NAME[i]}` };
  if (!l && !i) return { ok: true, factor: 0.6, note: "GENDER NOT STATED on the line or the item — check" };
  return { ok: true, factor: 0.6, note: l ? `GENDER NOT STATED on the item (line says ${GENDER_NAME[l]}) — check` : `GENDER NOT STATED on the line (item is ${GENDER_NAME[i]}) — check` };
}

function kindFlags(flags: readonly string[]): string {
  return KIND_FLAGS.filter((f) => flags.includes(f)).join(",");
}

export function offerCandidates(line: { description: string; brand: string | null }, id: Identity, items: readonly OfferItem[], max = 3): OfferCandidate[] {
  const lineWords = new Set([...words(line.description), ...words(line.brand ?? ""), ...id.nameWords.flatMap(words), ...words(id.brand)]);
  const lineKind = kindFlags(id.flags);
  const gender = lineGender(line.description, id.gender);
  const out: OfferCandidate[] = [];
  for (const it of items) {
    const need = nameKeyWords(it.name);
    // Spacing typos count as the same words ("LOVEME AMETHYST" = "LOVE ME AMETHYST", owner 19:03 CT).
    const lineCompact = [...words(line.description), ...id.nameWords.flatMap(words)].join("");
    if (!need.length || !(need.every((w) => lineWords.has(w)) || lineCompact.includes(need.join("")))) continue;
    if (id.brand && it.brand && id.brand !== it.brand) continue;
    const brandWords = words(it.brand).filter((w) => w.length >= 3 && !NOISE.has(w));
    const brandSeen = id.brand === it.brand || brandWords.some((w) => lineWords.has(w));
    // Owner 2026-11-14 17:34 CT: "THE ENGINE, WHEN RECOMMENDING, IT MUST BE FROM SAME BRAND." A line whose brand is not
    // my item's brand — or names no brand at all — is never proposed; it is linked by search only.
    if (!brandSeen) continue;
    // Size: proposed even when it differs (vendors round 105 / 110 ml to "3.4oz") but scored lower and both sizes
    // shown; the owner decides.
    if (sizesFar(id.sizeMl, it.size_ml)) continue;
    const sizeDiffers = id.sizeMl != null && it.size_ml != null && Math.abs(id.sizeMl - it.size_ml) > 5;
    if (lineKind !== kindFlags(it.flags)) continue;
    // Men's and women's bottles are different products (genderCheck).
    const gc = genderCheck(gender, it.gender, it.name);
    if (!gc.ok) continue;
    // A name word the line has and my item does not is a DIFFERENT bottle (measured live 11-13 on ESPERANZA:
    // WANTED vs WANTED INTENSE, HER vs HER BLOSSOM, GOOD GIRL vs GOOD GIRL BLUSH, 212 VIP vs 212 VIP ROSE) — not
    // proposed. Gender words and noise words do not count.
    const itemAll = new Set([...need, ...words(it.brand), ...words(it.name)]);
    const itemCompact = [...itemAll].join("") + need.join("");
    const extras = [...new Set(id.nameWords.flatMap(words))].filter((w) => !itemAll.has(w) && !NOISE.has(w) && !GENDER_WORDS.has(w) && !need.join("").includes(w) && !itemCompact.includes(w));
    if (extras.length) continue;
    const sizeOk = id.sizeMl != null && it.size_ml != null;
    // Type (EDT / EDP / PARFUM / EXTRAIT) differing is usually a different bottle: proposed, scored lower, named.
    const concDiffers = Boolean(id.conc && it.conc && id.conc !== it.conc);
    const score = Math.round(Math.min(1, gc.factor * (concDiffers ? 0.7 : 1) * (sizeDiffers ? 0.7 : 1) * (brandSeen ? 1 : 0.9) * (sizeOk ? 1 : 0.95)) * 100) / 100;
    const why = [brandSeen ? "brand + name words match" : "name words match (no brand on the line)",
      sizeDiffers ? `SIZE DIFFERS: line ${id.sizeMl} ml, your item ${it.size_ml} ml` : sizeOk ? `size ${it.size_ml} ml` : "size not on the line",
      ...(concDiffers ? [`TYPE DIFFERS: line ${id.conc}, your item ${it.conc}`] : []), gc.note].join(" · ");
    out.push({ item_id: it.id, display_name: it.display_name, score, why });
  }
  return out.sort((a, b) => b.score - a.score || a.display_name.localeCompare(b.display_name)).slice(0, max);
}
