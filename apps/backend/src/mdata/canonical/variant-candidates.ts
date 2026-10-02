/**
 * ROUND 297 — VARIANT DUPLICATE CANDIDATES (propose only; the owner approves every merge).
 *
 * The canonical engine (canonical-entities.service.ts) groups parties whose names normalise EQUAL. It cannot see the
 * same company written another way: "S E Mares Forwarding Service LLC" vs "Semares Forwarding Services", an acronym
 * vs the expanded name ("DLS Dardini Logistics Services" vs "DARDINI LLC"), a truncation ("FLS Transport Inc." vs
 * "FLS TRANSPORTATION SERVICES LIMITED"), a spelling variant across modules ("CTS EXPRESS LLC" vs "CTS XPRESS LLC").
 *
 * Pipeline: normalise (case, punctuation, whitespace, legal suffixes, spaced initials, plurals) -> token-set overlap ->
 * acronym -> token-prefix containment -> phonetic (Soundex per token). A pair is proposed with every reason that
 * fired and a score; nothing here writes.
 */

const LEGAL_SUFFIXES = new Set([
  "llc", "l", "lc", "inc", "incorporated", "corp", "corporation", "co", "company", "ltd", "limited", "dba", "lp", "llp",
  "pllc", "plc", "sa", "de", "cv", "srl", "s", "rl", "the",
]);

/** Lowercase, strip punctuation, join runs of single letters ("s e mares" -> "semares"), drop legal suffixes, singularise. */
export function partyTokens(name: string): string[] {
  const raw = name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  // Join consecutive one-letter tokens into the next token: "s e mares" -> "semares", "s e" -> "se".
  const joined: string[] = [];
  let pending = "";
  for (const t of raw) {
    if (t.length === 1 && /[a-z]/.test(t)) {
      pending += t;
      continue;
    }
    if (pending) {
      joined.push(pending.length >= 2 && !LEGAL_SUFFIXES.has(t) ? pending + t : pending);
      if (!(pending.length >= 2 && !LEGAL_SUFFIXES.has(t))) joined.push(t);
      pending = "";
    } else joined.push(t);
  }
  if (pending) joined.push(pending);
  // Plurals are not stripped here ("semares" is a name): token equality below is prefix-tolerant instead.
  return joined.filter((t) => !LEGAL_SUFFIXES.has(t));
}

/** Consonant skeleton: "express" and "xpress" -> "xprs"; "phone"/"fone" -> "fn". */
export function phoneticKey(token: string): string {
  return token
    .toLowerCase()
    .replace(/^ex/, "x")
    .replace(/ph/g, "f")
    .replace(/ck/g, "k")
    .replace(/(.)\1+/g, "$1")
    .replace(/(?!^)[aeiouyhw]/g, "");
}

/** Soundex of one token (American Soundex). */
export function soundex(token: string): string {
  const s = token.toLowerCase().replace(/[^a-z]/g, "");
  if (!s) return "";
  const map: Record<string, string> = {
    b: "1", f: "1", p: "1", v: "1", c: "2", g: "2", j: "2", k: "2", q: "2", s: "2", x: "2", z: "2",
    d: "3", t: "3", l: "4", m: "5", n: "5", r: "6",
  };
  let out = s[0]!.toUpperCase();
  let last = map[s[0]!] ?? "";
  for (const ch of s.slice(1)) {
    const code = map[ch] ?? "";
    if (code && code !== last) out += code;
    if (ch !== "h" && ch !== "w") last = code;
    if (out.length === 4) break;
  }
  return out.padEnd(4, "0");
}

export type VariantReason = "same_squashed_name" | "token_set" | "acronym" | "token_prefix" | "concatenated" | "phonetic";
export type VariantMatch = { score: number; reasons: VariantReason[] };

const prefixEq = (a: string, b: string) => a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a));
const initials = (tokens: string[]) => tokens.map((t) => t[0]).join("");

/** Score two party names. null = not a candidate. Equal normalised names are the canonical engine's job, not this one. */
export function matchParties(a: string, b: string, isGeneric: (t: string) => boolean = () => false): VariantMatch | null {
  return matchTokens(partyTokens(a), partyTokens(b), isGeneric);
}

/**
 * isGeneric: a token so common across the namespace ("logistics", "express", "transport") that sharing it proves
 * nothing. Token-set / prefix / phonetic matches must share >= 1 DISTINCTIVE token and leave no distinctive token
 * unmatched on either side ("Express Logistics" is not "Grane Logistics Express"; "Worldwide Express" is not
 * "Worldwide Express Globaltranz").
 */
export function matchTokens(ta: string[], tb: string[], isGeneric: (t: string) => boolean = () => false): VariantMatch | null {
  if (!ta.length || !tb.length) return null;
  const same = (x: string, y: string) => x === y || prefixEq(x, y) || (x.length >= 4 && y.length >= 4 && phoneticKey(x) === phoneticKey(y));
  const distinctiveA = ta.filter((t) => !isGeneric(t));
  const distinctiveB = tb.filter((t) => !isGeneric(t));
  const coreAgrees =
    distinctiveA.length > 0 &&
    distinctiveB.length > 0 &&
    distinctiveA.every((x) => tb.some((y) => same(x, y))) &&
    distinctiveB.every((y) => ta.some((x) => same(x, y)));
  const reasons: VariantReason[] = [];
  let score = 0;

  const sqa = ta.join("");
  const sqb = tb.join("");
  if (sqa === sqb) {
    reasons.push("same_squashed_name");
    score = Math.max(score, 1);
  }

  // Concatenation: one name written without spaces / truncated ("BLUEBEACON" vs "Blue Beacon Truck Wash",
  // "PILOTMBRIDGE,OH" vs "PILOT"): one squashed name starts with the other's (min 5 letters, never a digit-only key).
  if (sqa !== sqb) {
    const [shorter, longer] = sqa.length <= sqb.length ? [sqa, sqb] : [sqb, sqa];
    if (shorter.length >= 5 && /[a-z]/.test(shorter) && longer.startsWith(shorter)) {
      reasons.push("concatenated");
      score = Math.max(score, shorter.length >= 8 ? 0.8 : 0.65);
    }
  }

  // Token-set overlap with prefix-tolerant token equality ("transport" ~ "transportation", "service" ~ "services").
  const matched = ta.filter((x) => tb.some((y) => x === y || prefixEq(x, y)));
  const overlap = matched.length / Math.min(ta.length, tb.length);
  const jaccard = matched.length / (ta.length + tb.length - matched.length);
  if (coreAgrees && overlap === 1 && Math.min(ta.length, tb.length) >= 2) {
    reasons.push(matched.every((x) => tb.includes(x)) ? "token_set" : "token_prefix");
    score = Math.max(score, 0.75 + 0.25 * jaccard);
  } else if (coreAgrees && overlap === 1 && ta[0] === tb[0] && ta[0]!.length >= 3) {
    // One distinctive shared leading token ("fls transport" / "fls transportation service"): truncation.
    reasons.push("token_prefix");
    score = Math.max(score, 0.7);
  }

  // Acronym: one side's leading token spells the other side's initials ("dls" + "dardini logistics service" vs "dardini").
  for (const [x, y] of [[ta, tb], [tb, ta]] as const) {
    const lead = x[0]!;
    const rest = x.slice(1);
    const inRest = (t: string) => rest.includes(t) || rest.some((u) => prefixEq(t, u)) || t === lead;
    const yDistinct = y.filter((t) => !isGeneric(t));
    if (
      lead.length >= 2 && lead.length <= 5 && rest.length >= 2 && initials(rest) === lead &&
      // the other name is THIS company: its distinctive words all sit in the expansion (or are the acronym itself)
      yDistinct.length > 0 && yDistinct.every(inRest) && yDistinct.some((t) => t !== lead || y.length === 1)
    ) {
      reasons.push("acronym");
      score = Math.max(score, 0.8);
    }
  }

  // Phonetic: same first token and every token pairwise Soundex-equal ("express" ~ "xpress" share code once squashed).
  if (coreAgrees && ta.length === tb.length && ta.every((x, i) => x === tb[i] || soundex(x) === soundex(tb[i]!) || (x.length >= 4 && phoneticKey(x) === phoneticKey(tb[i]!)))) {
    if (sqa !== sqb) {
      reasons.push("phonetic");
      score = Math.max(score, 0.85);
    }
  }

  return reasons.length ? { score: Math.round(score * 100) / 100, reasons: [...new Set(reasons)] } : null;
}

export type PartyKind = "customer" | "vendor" | "factoring_debtor";
export type PartyRecord = {
  kind: PartyKind;
  id: string; // uuid for customers / vendors; the debtor name for a Faro debtor
  name: string;
  docs: number; // invoices (customer) · bills (vendor) · Faro lines (debtor)
  total_cents: number;
  open_cents: number;
};
export type VariantPair = {
  a: PartyRecord;
  b: PartyRecord;
  score: number;
  reasons: VariantReason[];
  /** Same kind and both have a uuid: mergeable through the canonical engine once the owner approves. */
  mergeable: boolean;
};

/** Blocking keys: a pair is only scored when the two names share one (keeps ~1.9k parties well under a second). */
function blockKeys(tokens: string[]): string[] {
  const keys = new Set<string>();
  for (const t of tokens) if (t.length >= 3) keys.add(`t:${t.slice(0, 4)}`);
  if (tokens[0]) keys.add(`p:${phoneticKey(tokens[0])}`);
  return [...keys];
}

/** Every candidate pair across the one namespace (customers + vendors + Faro debtors), best first. */
export function variantPairs(parties: PartyRecord[], normalizedKey: (name: string) => string): VariantPair[] {
  const tokens = parties.map((p) => partyTokens(p.name));
  const keys = parties.map((p) => normalizedKey(p.name));
  // Document frequency: a token on >= max(6, 0.3% of parties) names is generic for this namespace.
  const df = new Map<string, number>();
  for (const t of tokens) for (const u of new Set(t)) df.set(u, (df.get(u) ?? 0) + 1);
  const genericAt = Math.max(6, Math.ceil(parties.length * 0.003));
  const isGeneric = (t: string) => (df.get(t) ?? 0) >= genericAt;
  const blocks = new Map<string, number[]>();
  tokens.forEach((t, i) => {
    for (const k of blockKeys(t)) {
      const list = blocks.get(k) ?? [];
      list.push(i);
      blocks.set(k, list);
    }
  });
  // A Faro debtor whose name normalises equal to a customer of the company already resolves to that customer: its
  // pairs are not a defect. Only a debtor with NO same-name customer is a cross-module variant ("CTS XPRESS LLC").
  const customerKeys = new Set(parties.flatMap((p, i) => (p.kind === "customer" ? [keys[i]!] : [])));
  const resolvedDebtor = (i: number) => parties[i]!.kind === "factoring_debtor" && customerKeys.has(keys[i]!);
  const seen = new Set<string>();
  const out: VariantPair[] = [];
  for (const members of blocks.values()) {
    for (let x = 0; x < members.length; x++) {
      for (let y = x + 1; y < members.length; y++) {
        const i = members[x]!;
        const j = members[y]!;
        const id = i < j ? `${i}:${j}` : `${j}:${i}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const a = parties[i]!;
        const b = parties[j]!;
        // Identical normalised names of the SAME kind are the canonical engine's groups, already merged / guarded.
        if (keys[i] === keys[j] && (a.kind === b.kind || a.kind === "factoring_debtor" || b.kind === "factoring_debtor")) continue;
        if (resolvedDebtor(i) || resolvedDebtor(j)) continue;
        const m = matchTokens(tokens[i]!, tokens[j]!, isGeneric);
        if (!m) continue;
        out.push({ a, b, score: m.score, reasons: m.reasons, mergeable: a.kind === b.kind && a.kind !== "factoring_debtor" });
      }
    }
  }
  return out.sort((p, q) => q.score - p.score || q.a.total_cents + q.b.total_cents - (p.a.total_cents + p.b.total_cents));
}
