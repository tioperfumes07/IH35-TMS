/**
 * PERFUME-DESK — matching a vendor line to an item. Pure (no DB): the service loads the index and
 * writes the result. Order, strongest first:
 *   1. UPC already on an item                       → matched "upc"
 *   2. this vendor's SKU already linked             → matched "sku"
 *   3. this vendor's spelling already confirmed     → matched "alias"
 *   4. identical identity key (brand+name+size+type+gender+flags) → matched "key"
 *   5. brand-less line, identical loose key, exactly ONE item has it → matched "loose_key"
 *   5b. a line with NO barcode (competitor lists such as La Esperanza print none): same name words + same bottle
 *       size + same flags, the same brand when the line names one, and every type / gender the line DOES print
 *       agrees — and exactly ONE item fits → matched "name". Two or more fits (EDT and EDP both on file, a line
 *       that prints no type) → review: the engine never picks between real products.
 *   6. a line WITH a brand and a UPC or SKU from a vendor I buy from → a NEW item ("new_item")
 *   7. anything else → "review" with up to 5 suggestions. Never counted in a price until confirmed.
 * Owner rule: identified correctly or not at all — no fuzzy score ever links an item by itself.
 */
import { identify, looseKey, normalizeUpc, type Identity } from "./normalize.js";

export type IndexItem = {
  id: string;
  brand: string;
  name: string;
  sizeMl: number | null;
  conc: string;
  gender: string;
  flags: string[];
  identityKey: string;
  looseKey: string;
  displayName: string;
};

export type MatchIndex = {
  items: Map<string, IndexItem>;
  byUpc: Map<string, string>;
  byKey: Map<string, string>;
  byLoose: Map<string, string[]>;
  /** `${nameWords}|${size}|${flags}` → items with that name, size and flags (any brand, type, gender). */
  byName: Map<string, string[]>;
  vendorSku: Map<string, string>;   // `${vendorId}|${sku}` → item id
  vendorText: Map<string, string>;  // `${vendorId}|${textKey}` → item id
  brandAliases: Record<string, string>;
};

export type LineIn = {
  upc?: string | null;
  sku?: string | null;
  brand?: string | null;
  description: string;
  size_text?: string | null;
  gender?: string | null;
  type?: string | null;
  section?: string | null;
};

export type Suggestion = { item_id: string; display_name: string; score: number; why: string };
export type LineMatch = {
  identity: Identity;
  upc: string;
  textKey: string;
  itemId: string | null;
  method: "upc" | "sku" | "alias" | "key" | "loose_key" | "name" | "new_item" | null;
  status: "matched" | "review" | "unmatched";
  suggestions: Suggestion[];
};

export function emptyIndex(brandAliases: Record<string, string> = {}): MatchIndex {
  return { items: new Map(), byUpc: new Map(), byKey: new Map(), byLoose: new Map(), byName: new Map(), vendorSku: new Map(), vendorText: new Map(), brandAliases };
}

export function addItem(ix: MatchIndex, it: IndexItem) {
  ix.items.set(it.id, it);
  ix.byKey.set(it.identityKey, it.id);
  const l = ix.byLoose.get(it.looseKey) ?? [];
  if (!l.includes(it.id)) l.push(it.id);
  ix.byLoose.set(it.looseKey, l);
  const nk = nameKeyOfIdentityKey(it.identityKey);
  if (nk) { const n = ix.byName.get(nk) ?? []; if (!n.includes(it.id)) n.push(it.id); ix.byName.set(nk, n); }
  if (it.brand && !ix.brandAliases[it.brand]) ix.brandAliases[it.brand] = it.brand; // every known brand is detectable in brand-less lines
}

/** identity key = brand|name|size|type|gender|flags[|contents]. Sets with listed contents never name-match. */
function nameKeyOfIdentityKey(k: string): string | null {
  const p = k.split("|");
  if (p.length !== 6 || p[2] === "?") return null;
  if (!p[1] && (!p[0] || p[0] === "?")) return null; // a brand-only item needs its brand
  return `${p[1]}|${p[2]}|${p[5]}`;
}

/** Tier 5b — see the header. Returns the ONE item that fits, else null. */
export function nameMatch(ix: MatchIndex, id: Identity): string | null {
  if (id.sizeMl == null || id.contents) return null;
  // A brand-only bottle ("ANIMALE M 3.4OZ EDT") matches only an item of that same brand with no name words.
  if (!id.nameWords.length && !id.brand) return null;
  const cands = ix.byName.get(`${id.nameWords.join(" ")}|${id.sizeMl}|${id.flags.join("+")}`) ?? [];
  const fits = cands.filter((cid) => {
    const it = ix.items.get(cid);
    if (!it) return false;
    if (id.brand && it.brand && it.brand !== id.brand) return false;
    if (!id.nameWords.length && it.brand !== id.brand) return false;
    if (id.conc && it.conc && it.conc !== id.conc) return false;
    if (id.gender && it.gender && it.gender !== id.gender) return false;
    return true;
  });
  return fits.length === 1 ? fits[0] : null;
}

/** The vendor's own spelling, normalized — what a confirmation remembers. */
export function textKeyOf(line: LineIn): string {
  return [line.brand ?? "", line.description, line.size_text ?? ""].join(" ").toUpperCase().replace(/\s+/g, " ").trim();
}

function trigrams(s: string): Set<string> {
  const t = `  ${s.toLowerCase()} `;
  const out = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3));
  return out;
}
export function similarity(a: string, b: string): number {
  const A = trigrams(a), B = trigrams(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter || 1);
}

/** The flags that make a different PRODUCT (not just a different condition such as DAMAGED / UNBOXED). */
const KIND_FLAGS = ["SET", "TESTER", "MINI", "BODY", "OIL", "VARIOUS", "REFILL"];
export function productKind(flags: readonly string[]): string {
  return KIND_FLAGS.filter((f) => flags.includes(f)).join("+");
}

/** Words that say nothing about WHICH fragrance it is (never enough on their own to pair two brands). */
const GENERIC_WORDS = new Set(["EDT", "EDP", "EDC", "PARFUM", "PERFUME", "COLOGNE", "SPRAY", "SP", "MEN", "WOMEN", "MAN", "WOMAN",
  "HOMME", "FEMME", "POUR", "FOR", "HIM", "HER", "THE", "DE", "LA", "LE", "OZ", "ML", "M", "W", "U", "EAU", "TOILETTE", "NEW"]);
// "PERRY ELLIS18" → PERRY ELLIS 18: a word glued to a number is two words.
const wordsOf = (s: string): string[] => s.toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/([A-Z])(\d)/g, "$1 $2").replace(/(\d)([A-Z])/g, "$1 $2").split(/\s+/).filter((w) => w.length > 1 && !GENERIC_WORDS.has(w));
const itemCache = new WeakMap<IndexItem, { full: Set<string>; words: Set<string>; stripped: string }>();
function itemFacts(it: IndexItem) {
  let f = itemCache.get(it);
  if (!f) {
    const brandWords = new Set(wordsOf(it.brand));
    // Some item names repeat their brand ("PERRY ELLIS · PERRY ELLIS18", "NARCISO R · NR VETIVER MUSC HIM").
    const stripped = wordsOf(it.name).filter((w) => !brandWords.has(w)).join(" ");
    f = { full: trigrams(`${it.brand} ${it.name}`), words: new Set(wordsOf(`${it.brand} ${it.name}`)), stripped };
    itemCache.set(it, f);
  }
  return f;
}
function similaritySets(A: Set<string>, B: Set<string>): number {
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter || 1);
}

export function suggest(ix: MatchIndex, id: Identity, limit = 5): Suggestion[] {
  const out: Suggestion[] = [];
  // The line's own fragrance words (brand words removed) — a different-brand candidate must share one of them.
  const lineBrandWords = new Set(wordsOf(id.brand));
  const lineNameWords = wordsOf(id.nameText).filter((w) => !lineBrandWords.has(w));
  const lineFull = trigrams(`${id.brand} ${id.nameText}`);
  for (const it of ix.items.values()) {
    if (id.sizeMl != null && it.sizeMl != null && Math.abs(id.sizeMl - it.sizeMl) > 0.5) continue;
    if (id.gender && it.gender && id.gender !== it.gender) continue;
    // A set is never suggested for a single bottle (or the reverse), nor a tester for a boxed bottle, a mini for a
    // full bottle, a body product for a fragrance (owner 2026-11-12: "it is not separating sets" — ARMANI CODE 4.2
    // EDP was offered "ARMANI CODE 125 ml SET").
    if (productKind(id.flags) !== productKind(it.flags)) continue;
    const sameBrand = !id.brand || !it.brand || id.brand === it.brand;
    let score: number;
    if (sameBrand) {
      const f = itemFacts(it);
      score = Math.max(similarity(id.nameText, it.name), f.stripped ? similarity(id.nameText, f.stripped) : 0);
      if (score < 0.3) continue;
    } else {
      // The item master spells some brands two ways (PINK SUGAR under AQUOLINA, NARCISO vs NARCISO R): a line
      // whose brand matches nothing still gets the bottle it names — compare brand + name together, require a
      // shared fragrance word, and rank it below same-brand candidates. Never auto-linked (review only).
      if (!lineNameWords.length) continue;
      const f = itemFacts(it);
      if (!lineNameWords.some((w) => f.words.has(w))) continue;
      score = similaritySets(lineFull, f.full) * 0.9;
      if (score < 0.35) continue;
    }
    const why: string[] = [];
    if (!sameBrand) why.push(`brand ${id.brand} vs ${it.brand}`);
    if (id.conc !== it.conc) why.push(`type ${id.conc || "?"} vs ${it.conc || "?"}`);
    if (id.flags.join() !== it.flags.join()) why.push(`flags ${id.flags.join("+") || "none"} vs ${it.flags.join("+") || "none"}`);
    if (!id.brand) why.push("line has no brand");
    out.push({ item_id: it.id, display_name: it.displayName, score: Math.round(score * 100) / 100, why: why.join("; ") || "name differs" });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function matchLine(ix: MatchIndex, vendorId: string, line: LineIn, opts: { allowNewItem: boolean }): LineMatch {
  const identity = identify({
    description: line.description, brand: line.brand, size: line.size_text, gender: line.gender, type: line.type,
    section: line.section, brandAliases: ix.brandAliases,
  });
  const upc = normalizeUpc(line.upc);
  const textKey = textKeyOf(line);
  const done = (itemId: string, method: LineMatch["method"]): LineMatch => ({ identity, upc, textKey, itemId, method, status: "matched", suggestions: [] });

  if (upc && ix.byUpc.has(upc)) return done(ix.byUpc.get(upc)!, "upc");
  const sku = (line.sku ?? "").trim();
  if (sku && ix.vendorSku.has(`${vendorId}|${sku}`)) return done(ix.vendorSku.get(`${vendorId}|${sku}`)!, "sku");
  if (ix.vendorText.has(`${vendorId}|${textKey}`)) return done(ix.vendorText.get(`${vendorId}|${textKey}`)!, "alias");
  // A line whose name is empty after cleaning ("DIOR HOMME COLOGNE" → brand + type only) never links by key.
  const named = identity.nameWords.length > 0;
  if (named && identity.brand && ix.byKey.has(identity.key)) return done(ix.byKey.get(identity.key)!, "key");
  if (named && !identity.brand) {
    const c = ix.byLoose.get(looseKey(identity)) ?? [];
    if (c.length === 1) return done(c[0], "loose_key");
  }
  if (!upc && (named || identity.brand)) { const n = nameMatch(ix, identity); if (n) return done(n, "name"); }
  // A brand-only bottle ("4711 3.4 EDC U") is a strong identity only when the vendor also gives its barcode.
  // With its barcode a line is a strong identity even when the vendor prints no known brand (Lux America
  // "AL HAMBRA ANARCH 100ML EDP"); without a barcode it needs brand + name + size.
  // A non-fragrance item (blotter, bag, cosmetic) has no bottle size; with its barcode it is still an item.
  const sizeOk = identity.sizeMl != null || (upc !== "" && (identity.flags.includes("VARIOUS") || identity.flags.includes("BODY")));
  const strongIdentity = sizeOk && (identity.brand !== "" || upc !== "") && (identity.nameWords.length > 0 || upc !== "");
  if (opts.allowNewItem && strongIdentity && (upc || sku) && !ix.byKey.has(identity.key)) {
    return { identity, upc, textKey, itemId: null, method: "new_item", status: "matched", suggestions: [] };
  }
  const suggestions = suggest(ix, identity);
  return { identity, upc, textKey, itemId: null, method: null, status: suggestions.length ? "review" : "unmatched", suggestions };
}

export function displayNameOf(id: Identity): string {
  const size = id.sizeMl != null ? `${id.sizeMl} ml` : "";
  const g = id.gender === "M" ? "Men" : id.gender === "W" ? "Women" : id.gender === "U" ? "Unisex" : "";
  const base = [id.brand, id.nameText, size, id.conc, g, id.flags.join(" ")].filter(Boolean).join(" · ");
  return id.contents ? `${base} · + ${id.contents.split("+").join(" + ")}` : base;
}
