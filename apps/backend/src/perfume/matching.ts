/**
 * PERFUME-DESK — matching a vendor line to an item. Pure (no DB): the service loads the index and
 * writes the result. Order, strongest first:
 *   1. UPC already on an item                       → matched "upc"
 *   2. this vendor's SKU already linked             → matched "sku"
 *   3. this vendor's spelling already confirmed     → matched "alias"
 *   4. identical identity key (brand+name+size+type+gender+flags) → matched "key"
 *   5. brand-less line, identical loose key, exactly ONE item has it → matched "loose_key"
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
  method: "upc" | "sku" | "alias" | "key" | "loose_key" | "new_item" | null;
  status: "matched" | "review" | "unmatched";
  suggestions: Suggestion[];
};

export function emptyIndex(brandAliases: Record<string, string> = {}): MatchIndex {
  return { items: new Map(), byUpc: new Map(), byKey: new Map(), byLoose: new Map(), vendorSku: new Map(), vendorText: new Map(), brandAliases };
}

export function addItem(ix: MatchIndex, it: IndexItem) {
  ix.items.set(it.id, it);
  ix.byKey.set(it.identityKey, it.id);
  const l = ix.byLoose.get(it.looseKey) ?? [];
  if (!l.includes(it.id)) l.push(it.id);
  ix.byLoose.set(it.looseKey, l);
  if (it.brand && !ix.brandAliases[it.brand]) ix.brandAliases[it.brand] = it.brand; // every known brand is detectable in brand-less lines
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

export function suggest(ix: MatchIndex, id: Identity, limit = 5): Suggestion[] {
  const out: Suggestion[] = [];
  for (const it of ix.items.values()) {
    if (id.sizeMl != null && it.sizeMl != null && Math.abs(id.sizeMl - it.sizeMl) > 0.5) continue;
    if (id.gender && it.gender && id.gender !== it.gender) continue;
    if (id.brand && it.brand && id.brand !== it.brand) continue;
    const score = similarity(id.nameText, it.name);
    if (score < 0.3) continue;
    const why: string[] = [];
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
  return [id.brand, id.nameText, size, id.conc, g, id.flags.join(" ")].filter(Boolean).join(" · ");
}
