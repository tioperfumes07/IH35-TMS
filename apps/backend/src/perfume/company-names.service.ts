/**
 * PERFUME company names — ROUND P1.31 L2 (owner 2026-11-27 15:47 CT): "BUYERS SHOULD ALSO BE LEFT SIDE, FULL COMPANY NAME, ALL PROPER
 * FORMAT, FIRST LETTER CAPITALL LETTER THEN REGUALR ETC. SPACES, IPBGROUP IS IPB Group".
 * Measured on production 2026-11-27: 4,821 contact companies (3,810 live), 24 all caps, 225 all lower, and run-together names that
 * came from e-mail domains ("Ipbgroup", "Dlginternationaltrading", "Kmfragrancesandbeauty", "Bsfragrances").
 *
 * properCompanyName() is pure and conservative: it only touches a name it can read with confidence and returns null otherwise
 * (an e-mail or web address, a bare number, a short all-caps code such as "OXXO" / "BSW"). The owner sees every change in a
 * preview first; Apply renames in place (never deletes, never merges; the match key is a generated column) and writes one history row per
 * company (perfume.lead_events, action 'name_formatted', from → to) in the same transaction.
 */
import type pg from "pg";
import { z } from "zod";
import { logEvents } from "./leads.events.js";

/** Kept upper wherever they appear as a word. */
const ACRONYMS = new Set(["llc", "llp", "usa", "uk", "uae", "ipb", "dba", "sa", "cv", "rl", "sapi", "nyc", "inc.", "b&s", "d&g", "jpg", "pca", "mtz", "tpg",
  "dfi", "dlg", "km", "bp", "mc", "tio", "hk", "dc", "ny", "nj", "fl", "tx"]);
/** Lower inside a name (never the first word). */
const SMALL = new Set(["de", "del", "la", "las", "los", "y", "and", "of", "the", "for", "et", "le", "di"]);
/** Words a run-together domain name ends with, longest first ("fragrances" before "fragrance"). */
const TAIL_WORDS = ["international", "distributors", "distribution", "fragrances", "wholesale", "cosmetics", "perfumes", "fragrance", "collection",
  "trading", "imports", "exports", "perfume", "parfums", "beauty", "brands", "retail", "scents", "supply", "stores", "group", "store", "corp", "shop",
  "intl", "and", "inc", "llc", "usa"];

const isAllCaps = (s: string) => s === s.toUpperCase() && s !== s.toLowerCase();
const isAllLower = (s: string) => s === s.toLowerCase() && s !== s.toUpperCase();
const hasVowel = (w: string) => /[aeiouy]/i.test(w);

function caseWord(w: string, first: boolean): string {
  const lw = w.toLowerCase();
  if (ACRONYMS.has(lw)) return lw === "inc." ? "Inc." : w.toUpperCase();
  if (!first && SMALL.has(lw)) return lw;
  // A 2–3 letter token with no vowel is an acronym ("Bp" → "BP", "Mc" → "MC").
  if (/^[a-z]{2,3}$/i.test(w) && !hasVowel(w)) return w.toUpperCase();
  return lw.charAt(0).toUpperCase() + lw.slice(1);
}

/** Splits a one-word domain-style name on the words it ends with: "ipbgroup" → ["ipb", "group"]. */
function splitRunTogether(token: string): string[] | null {
  let rest = token.toLowerCase();
  const tail: string[] = [];
  let moved = true;
  while (moved) {
    moved = false;
    for (const t of TAIL_WORDS) {
      if (rest.length > t.length + 1 && rest.endsWith(t)) { tail.unshift(t); rest = rest.slice(0, -t.length); moved = true; break; }
    }
  }
  if (!tail.length) return null;
  if (rest.startsWith("the") && rest.length > 4) return ["the", rest.slice(3), ...tail];
  return [rest, ...tail];
}

/** Mexican legal forms written any way → "S.A. de C.V." / "S. de R.L. de C.V." spelled the way the name already does, cased right. */
function mexicanForms(s: string): string {
  return s
    .replace(/\bS\.?\s*A\.?\s+De\s+C\.?\s*V\.?(?=$|\s|,)/gi, (m) => (m.includes(".") ? "S.A. de C.V." : "SA de CV"))
    .replace(/\bS\.?\s+De\s+R\.?\s*L\.?\s+De\s+C\.?\s*V\.?(?=$|\s|,)/gi, (m) => (m.includes(".") ? "S. de R.L. de C.V." : "S de RL de CV"));
}

/** The properly formatted company name, or null when the name is already right or cannot be read with confidence. */
export function properCompanyName(raw: string | null | undefined): string | null {
  const name = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!name) return null;
  if (/@|\.(com|net|org|mx|us|co)\b|^www\./i.test(name)) return null; // an e-mail / web address is not a company name
  if (/^[\d\s.-]+$/.test(name)) return null; // a bare number
  const words = name.split(" ");
  let out: string;
  if (words.length === 1) {
    const w = words[0]!;
    const split = /^[a-z]+$/i.test(w) ? splitRunTogether(w) : null;
    if (split && (isAllLower(w) || /^[A-Z][a-z]+$/.test(w))) out = split.map((p, i) => caseWord(p, i === 0)).join(" ");
    else if (isAllCaps(w) && w.length <= 6) return null; // a short code ("OXXO", "BSW", "MJBK")
    else if (isAllCaps(w) || isAllLower(w)) out = caseWord(w, true);
    else out = w;
  } else if (isAllCaps(name) || isAllLower(name)) {
    // All caps: a ≤ 3-letter word stays as typed ("B&S", "DYO", "B2"); all lower: every word is cased.
    out = words.map((w, i) => (isAllCaps(name) && w.replace(/[^A-Za-z]/g, "").length <= 3 ? w : caseWord(w, i === 0))).join(" ");
  } else {
    // Mixed case already: only fix known acronyms and vowel-less 2–3 letter tokens ("Ipb Anays" → "IPB Anays", "Bp Mc" → "BP MC").
    out = words.map((w) => {
      const lw = w.toLowerCase();
      if (ACRONYMS.has(lw) && lw !== "inc.") return w.toUpperCase();
      if (/^[A-Z][a-z]{1,2}$/.test(w) && !hasVowel(w)) return w.toUpperCase();
      return w;
    }).join(" ");
  }
  out = mexicanForms(out);
  return out === name ? null : out;
}

export type NameFix = { id: string; role: string | null; from: string; to: string; added_on?: string | null };

/** Every live contact company whose name the rule would change (the owner reviews this before Apply). */
export async function previewNameFixes(c: Pick<pg.PoolClient, "query">): Promise<NameFix[]> {
  const rows = (await c.query<{ id: string; name: string; role: string | null; added_on: string | null }>(
    `SELECT id::text, name, role, (created_at AT TIME ZONE 'America/Chicago')::date::text AS added_on FROM perfume.contact_companies WHERE archived_at IS NULL ORDER BY name`)).rows;
  const fixes: NameFix[] = [];
  for (const r of rows) {
    const to = properCompanyName(r.name);
    if (to) fixes.push({ id: r.id, role: r.role, from: r.name, to, added_on: r.added_on });
  }
  return fixes;
}

export const applyNameFixesSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(10000) });

/** Renames the picked companies to the rule's name (recomputed now, never sent by the browser) with one history row each. */
export async function applyNameFixes(c: pg.PoolClient, uid: string, ids: string[]) {
  const rows = (await c.query<{ id: string; name: string }>(
    `SELECT id::text, name FROM perfume.contact_companies WHERE id = ANY($1::uuid[]) AND archived_at IS NULL FOR UPDATE`, [ids])).rows;
  const done: NameFix[] = [];
  for (const r of rows) {
    const to = properCompanyName(r.name);
    if (!to) continue;
    await c.query(`UPDATE perfume.contact_companies SET name = $2, updated_at = now() WHERE id = $1::uuid`, [r.id, to]);
    done.push({ id: r.id, role: null, from: r.name, to });
  }
  await logEvents(c, uid, done.map((d) => ({ entity: "company" as const, entity_id: d.id, company_id: d.id, action: "name_formatted", detail: { from: d.from, to: d.to } })));
  return { renamed: done.length, skipped: ids.length - done.length };
}
