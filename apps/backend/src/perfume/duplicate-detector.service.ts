/**
 * PERFUME duplicate detector engine (migration 202617180100) — owner 2026-11-27 17:17 CT: "AN AUTOMATICATE DUPLICATE DETECTOR ENGINE AND
 * RECOMENDATIONS … AND WE JSUT CONFIRM".
 *
 * scanDuplicates() looks at every live contact company (contacts, customers and vendors are one company record) and records each pair
 * that is probably the same company, with WHY:
 *   * same_name      — the same match key (perfume.name_key: no accents, punctuation, LLC / S.A. de C.V. tail)           score 1.00
 *   * similar_name   — names that differ by a word or a typo (pg_trgm similarity of the match keys ≥ 0.65)               score = similarity
 *   * same_phone     — the same last 10 digits of the phone                                                               + 0.30
 *   * same_domain    — the same web / e-mail domain (gmail, yahoo, hotmail … ignored)                                    + 0.30
 *   * same_address   — the same street address in the same city                                                           + 0.25
 * A pair with only a contact signal (phone / domain / address, names unlike) is kept when the names still share a word (similarity ≥
 * 0.35) — two different companies can share an accountant's phone. Score is capped at 1.
 * A pair already merged or dismissed ("not a duplicate") is never suggested again; an open pair whose company was archived or merged
 * elsewhere closes as 'gone'. confirmDuplicate() merges through company-merge.service.ts (the company with more attached stays; the
 * other becomes its location); dismissDuplicate() records "not a duplicate". The engine runs after every contacts import / Excel update /
 * merge and when the queue is opened.
 */
import type pg from "pg";
import { z } from "zod";
import { mergeCompanies } from "./company-merge.service.js";
import { logEvents } from "./leads.events.js";

type Q = Pick<pg.PoolClient, "query">;

const FREE_DOMAINS = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com", "live.com", "msn.com", "yahoo.com.mx", "hotmail.es", "prodigy.net.mx", "me.com", "comcast.net"];

/** Finds the probable duplicate pairs among live companies and upserts them as open recommendations. Returns how many are open. */
export async function scanDuplicates(c: Q) {
  await c.query(`SELECT set_limit(0.35)`);
  const pairs = await c.query<{ a: string; b: string; reasons: string[]; score: string }>(
    `WITH cc AS (
       SELECT id, name_key, lower(nullif(btrim(city), '')) AS city,
              nullif(right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10), '') AS phone10,
              nullif(lower(regexp_replace(coalesce(domain, ''), '^(https?://)?(www\\.)?', '')), '') AS dom,
              nullif(lower(regexp_replace(coalesce(address, ''), '[^a-z0-9]+', ' ', 'gi')), '') AS addr
         FROM perfume.contact_companies WHERE archived_at IS NULL AND coalesce(name_key, '') <> ''),
     p AS (
       SELECT a.id AS a, b.id AS b, similarity(a.name_key, b.name_key) AS sim,
              a.name_key = b.name_key AS same_name,
              (a.phone10 IS NOT NULL AND length(a.phone10) = 10 AND a.phone10 = b.phone10) AS same_phone,
              (a.dom IS NOT NULL AND a.dom = b.dom AND a.dom <> ALL ($1::text[])) AS same_domain,
              (a.addr IS NOT NULL AND length(a.addr) > 8 AND a.addr = b.addr AND a.city IS NOT DISTINCT FROM b.city) AS same_address
         FROM cc a JOIN cc b ON a.id < b.id AND a.name_key % b.name_key)
     SELECT a::text, b::text,
            array_remove(ARRAY[CASE WHEN same_name THEN 'same_name' END, CASE WHEN NOT same_name AND sim >= 0.65 THEN 'similar_name' END,
              CASE WHEN same_phone THEN 'same_phone' END, CASE WHEN same_domain THEN 'same_domain' END, CASE WHEN same_address THEN 'same_address' END], NULL) AS reasons,
            least(1, CASE WHEN same_name THEN 1 ELSE sim END + CASE WHEN same_phone THEN 0.30 ELSE 0 END
              + CASE WHEN same_domain THEN 0.30 ELSE 0 END + CASE WHEN same_address THEN 0.25 ELSE 0 END)::text AS score
       FROM p
      WHERE same_name OR sim >= 0.65 OR same_phone OR same_domain OR same_address`, [FREE_DOMAINS]);
  const rows = pairs.rows.filter((r) => r.reasons.length);
  // Owner 2026-11-27 18:21 CT: "b&s global and b&s group should be the same, check emails, contact names etc." — three more signals the
  // name trigram misses: the same person (e-mail) at both companies, the same core name once "(distributor)"-style notes and "(B&S
  // Group)" aliases are read, and the same initials brand ("B&S …") on two vendors.
  const extra = await extraPairs(c);
  const byKey = new Map(rows.map((r) => [`${r.a}|${r.b}`, r]));
  for (const e of extra) {
    const k = `${e.a}|${e.b}`, cur = byKey.get(k);
    if (cur && e.reasons[0] === "same_core_name" && cur.reasons.includes("same_name")) continue;
    if (cur) { cur.reasons = [...new Set([...cur.reasons, ...e.reasons])]; cur.score = String(Math.min(1, Number(cur.score) + e.add)); }
    else { const r = { a: e.a, b: e.b, reasons: e.reasons, score: String(Math.min(1, e.base)) }; rows.push(r); byKey.set(k, r); }
  }
  for (let i = 0; i < rows.length; i += 1000) {
    const part = rows.slice(i, i + 1000);
    await c.query(
      `INSERT INTO perfume.duplicate_candidates (entity, a_id, b_id, reasons, score)
       SELECT 'company', x.a::uuid, x.b::uuid, x.reasons, x.score FROM jsonb_to_recordset($1::jsonb) AS x(a text, b text, reasons text[], score numeric)
       ON CONFLICT (entity, a_id, b_id) DO UPDATE SET reasons = EXCLUDED.reasons, score = EXCLUDED.score, last_seen_at = now()
         WHERE perfume.duplicate_candidates.status = 'open'`,
      [JSON.stringify(part.map((r) => ({ a: r.a, b: r.b, reasons: r.reasons, score: Number(r.score) })))]);
  }
  // An open pair whose company is no longer live (merged elsewhere / archived) closes as 'gone'.
  await c.query(
    `UPDATE perfume.duplicate_candidates d SET status = 'gone', decided_at = now()
      WHERE d.status = 'open' AND EXISTS (SELECT 1 FROM perfume.contact_companies x WHERE x.id IN (d.a_id, d.b_id) AND x.archived_at IS NOT NULL)`);
  const open = (await c.query<{ n: number }>(`SELECT count(*)::int n FROM perfume.duplicate_candidates WHERE status = 'open'`)).rows[0]!.n;
  return { found: rows.length, open };
}


/** Notes that describe a company, not name it: "(distributor)", "(vendor)" … — dropped before comparing names. */
const NOTE_WORDS = new Set(["distributor", "distribuidor", "vendor", "supplier", "customer", "cliente", "proveedor", "brand", "wholesale", "retail", "trader", "store", "shop", "facturas", "invoices"]);
const keyOf = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\b(llc|inc|corp|co|ltd|bv|gmbh|sa de cv|s de rl de cv)\b\.?/g, " ")
  .replace(/[^a-z0-9]+/g, " ").trim();
/** The keys a company name answers to: its core (notes and parentheses removed) and each alias written in parentheses. */
export function nameAliases(name: string): string[] {
  const out = new Set<string>();
  const core = keyOf(name.replace(/\([^)]*\)/g, " "));
  if (core.length >= 3) out.add(core);
  for (const m of name.matchAll(/\(([^)]*)\)/g)) {
    const k = keyOf(m[1] ?? "");
    if (k.length >= 3 && !k.split(" ").every((w) => NOTE_WORDS.has(w))) out.add(k);
  }
  return [...out];
}
/** "B&S Group" → "b s": the leading single-letter initials of a name (two or more), the brand a family of companies shares. */
export function initialsPrefix(name: string): string | null {
  const w = keyOf(name.replace(/\([^)]*\)/g, " ")).split(" ");
  let i = 0; while (i < w.length && w[i]!.length === 1) i += 1;
  return i >= 2 ? w.slice(0, i).join(" ") : null;
}

type Extra = { a: string; b: string; reasons: string[]; base: number; add: number };
async function extraPairs(c: Q): Promise<Extra[]> {
  const out: Extra[] = [];
  const push = (x: string, y: string, reason: string, base: number, add: number) => {
    if (x === y) return;
    const [a, b] = x < y ? [x, y] : [y, x];
    out.push({ a, b, reasons: [reason], base, add });
  };
  // Same person: one e-mail address on a contact of both companies.
  const people = await c.query<{ a: string; b: string }>(
    `SELECT DISTINCT p1.company_id::text AS a, p2.company_id::text AS b
       FROM perfume.contact_people p1 JOIN perfume.contact_people p2 ON lower(p1.email) = lower(p2.email) AND p1.company_id < p2.company_id
       JOIN perfume.contact_companies c1 ON c1.id = p1.company_id AND c1.archived_at IS NULL
       JOIN perfume.contact_companies c2 ON c2.id = p2.company_id AND c2.archived_at IS NULL
      WHERE p1.archived_at IS NULL AND p2.archived_at IS NULL AND coalesce(p1.email, '') LIKE '%@%'`);
  for (const r of people.rows) push(r.a, r.b, "same_contact_email", 0.85, 0.3);
  // Same person name at the same mailbox name on a near-identical domain (a typo domain: bsfragances.com / bsfragrances.com).
  const typo = await c.query<{ a: string; b: string }>(
    `WITH e AS (SELECT p.company_id, split_part(lower(p.email), '@', 1) AS box, split_part(lower(p.email), '@', 2) AS dom FROM perfume.contact_people p
                  JOIN perfume.contact_companies c ON c.id = p.company_id AND c.archived_at IS NULL WHERE p.archived_at IS NULL AND p.email LIKE '%@%.%')
     SELECT DISTINCT e1.company_id::text AS a, e2.company_id::text AS b FROM e e1 JOIN e e2 ON e1.box = e2.box AND e1.company_id < e2.company_id
      WHERE e1.dom <> e2.dom AND e1.dom <> ALL ($1::text[]) AND e2.dom <> ALL ($1::text[]) AND similarity(e1.dom, e2.dom) >= 0.6`, [FREE_DOMAINS]);
  for (const r of typo.rows) push(r.a, r.b, "same_contact_similar_domain", 0.75, 0.25);
  // Same core name / alias, and the same initials brand on two vendors.
  const cos = (await c.query<{ id: string; name: string; role: string | null }>(
    `SELECT id::text, name, role FROM perfume.contact_companies WHERE archived_at IS NULL`)).rows;
  const byAlias = new Map<string, string[]>(), byInitials = new Map<string, string[]>();
  for (const co of cos) {
    for (const k of nameAliases(co.name)) byAlias.set(k, [...(byAlias.get(k) ?? []), co.id]);
    const ini = initialsPrefix(co.name);
    if (ini && (co.role === "vendor" || co.role === "both")) byInitials.set(ini, [...(byInitials.get(ini) ?? []), co.id]);
  }
  const pairUp = (ids: string[], reason: string, base: number, add: number, cap: number) => {
    const u = [...new Set(ids)];
    if (u.length < 2 || u.length > cap) return; // a key shared by too many is a common word, not one company
    for (let i = 0; i < u.length; i += 1) for (let j = i + 1; j < u.length; j += 1) push(u[i]!, u[j]!, reason, base, add);
  };
  for (const ids of byAlias.values()) pairUp(ids, "same_core_name", 0.9, 0.2, 12);
  for (const ids of byInitials.values()) pairUp(ids, "same_brand_initials", 0.55, 0.1, 12);
  return out;
}

export type Recommendation = { id: string; reasons: string[]; score: number; first_seen_at: string;
  a: CompanyCard; b: CompanyCard; keep: "a" | "b" };
type CompanyCard = { id: string; name: string; role: string | null; city: string | null; state: string | null; phone: string | null; domain: string | null;
  address: string | null; people: number; docs: number; created_at: string };

const CARD = (alias: string) => `json_build_object('id', ${alias}.id, 'name', ${alias}.name, 'role', ${alias}.role, 'city', ${alias}.city, 'state', ${alias}.state,
  'phone', ${alias}.phone, 'domain', ${alias}.domain, 'address', ${alias}.address, 'created_at', ${alias}.created_at,
  'people', (SELECT count(*) FROM perfume.contact_people p WHERE p.company_id = ${alias}.id AND p.archived_at IS NULL),
  'docs', (SELECT count(*) FROM perfume.quotes q WHERE q.company_id = ${alias}.id) + (SELECT count(*) FROM perfume.sales_orders o WHERE o.company_id = ${alias}.id)
          + (SELECT count(*) FROM perfume.vendors v WHERE v.company_id = ${alias}.id)
          + (SELECT count(*) FROM scentsx.customer_links l WHERE l.contact_company_id = ${alias}.id AND l.voided_at IS NULL) * 1000)`;

/** The open recommendations, best first, each with both companies side by side and which one would stay. */
export async function listRecommendations(c: Q, f: { limit?: number } = {}): Promise<{ open: number; rows: Recommendation[] }> {
  const rows = (await c.query<{ id: string; reasons: string[]; score: string; first_seen_at: string; a: CompanyCard; b: CompanyCard }>(
    `SELECT d.id::text, d.reasons, d.score::text, d.first_seen_at::text, ${CARD("a")} AS a, ${CARD("b")} AS b
       FROM perfume.duplicate_candidates d JOIN perfume.contact_companies a ON a.id = d.a_id JOIN perfume.contact_companies b ON b.id = d.b_id
      WHERE d.status = 'open' AND a.archived_at IS NULL AND b.archived_at IS NULL
      ORDER BY d.score DESC, a.name LIMIT $1`, [Math.min(f.limit ?? 10000, 10000)])).rows;
  const open = (await c.query<{ n: number }>(`SELECT count(*)::int n FROM perfume.duplicate_candidates WHERE status = 'open'`)).rows[0]!.n;
  return {
    open,
    rows: rows.map((r) => {
      const wa = Number(r.a.docs) * 10 + Number(r.a.people), wb = Number(r.b.docs) * 10 + Number(r.b.people);
      const keep: "a" | "b" = wa > wb ? "a" : wb > wa ? "b" : r.a.created_at <= r.b.created_at ? "a" : "b";
      return { id: r.id, reasons: r.reasons, score: Number(r.score), first_seen_at: r.first_seen_at, a: r.a, b: r.b, keep };
    }),
  };
}

export const decideSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(1000), keep: z.record(z.string().uuid(), z.enum(["a", "b"])).optional() });

/** Confirm: merge each pair (the side picked, else the recommended one, stays). */
export async function confirmDuplicates(c: pg.PoolClient, uid: string, ids: string[], keepPick: Record<string, "a" | "b"> = {}) {
  const recs = (await listRecommendations(c, { limit: 5000 })).rows.filter((r) => ids.includes(r.id));
  let merged = 0;
  for (const r of recs) {
    const side = keepPick[r.id] ?? r.keep;
    const keep = side === "a" ? r.a.id : r.b.id, other = side === "a" ? r.b.id : r.a.id;
    const stillLive = (await c.query(`SELECT 1 FROM perfume.contact_companies WHERE id = ANY($1::uuid[]) AND archived_at IS NULL`, [[keep, other]])).rowCount;
    if (stillLive !== 2) { await c.query(`UPDATE perfume.duplicate_candidates SET status = 'gone', decided_at = now() WHERE id = $1::uuid`, [r.id]); continue; }
    merged += await mergeCompanies(c, uid, keep, [other], `duplicate recommendation: ${r.reasons.join(", ")}`);
    await c.query(`UPDATE perfume.duplicate_candidates SET status = 'merged', decided_by = $2::uuid, decided_at = now() WHERE id = $1::uuid`, [r.id, uid]);
  }
  await scanDuplicates(c);
  return { merged };
}

/** Not a duplicate: never suggested again. */
export async function dismissDuplicates(c: pg.PoolClient, uid: string, ids: string[]) {
  const r = await c.query<{ a_id: string; b_id: string }>(
    `UPDATE perfume.duplicate_candidates SET status = 'dismissed', decided_by = $2::uuid, decided_at = now()
      WHERE id = ANY($1::uuid[]) AND status = 'open' RETURNING a_id::text, b_id::text`, [ids, uid]);
  await logEvents(c, uid, r.rows.map((x) => ({ entity: "company" as const, entity_id: x.a_id, company_id: x.a_id, action: "not_duplicate", detail: { of: x.b_id } })));
  return { dismissed: r.rowCount ?? 0 };
}
