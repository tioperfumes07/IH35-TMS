/**
 * SCENTSX B9b — OFAC sanctions list + screening; Texas resale certificates; export proof (migration 202616930100).
 *
 * Owner 2026-11-26 20:18 CT compliance; design https://claude.ai/artifact/VQ83ogvJyPpVoop1FNKJXC section 8. The list is OFAC's
 * Specially Designated Nationals list from the Sanctions List Service (SDN.CSV primary names + ALT.CSV aliases; URL verified
 * 2026-11-26 HTTP 200, published 2026-11-20). Every load is kept; a screening names the load it ran against. A party is BLOCKED
 * when it was never screened against the newest list, or its newest screening is a possible match the owner has not cleared
 * with a written reason (or confirmed as a match).
 */
import { createHash } from "node:crypto";
import type pg from "pg";
import { scopeToScentsx, ScentsxLinkInvalid, ScentsxLinkNotFound } from "./links.service.js";

type Q = Pick<pg.PoolClient, "query">;

export const OFAC_SDN_URL = "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.CSV";
export const OFAC_ALT_URL = "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/ALT.CSV";
/** pg_trgm similarity on normalized names at or above which a screening is a possible match. Low on purpose: the owner clears. */
export const SANCTIONS_MATCH_THRESHOLD = 0.6;

const SUFFIXES = new Set(["LLC", "L", "C", "INC", "CORP", "CORPORATION", "CO", "COMPANY", "LTD", "LIMITED", "SA", "DE", "CV", "SRL", "RL", "SAPI", "S", "A", "THE", "GMBH", "BV", "PLC", "LLP", "LP"]);

/** Upper-case, accents removed, punctuation to spaces, company-form words dropped, spaces collapsed. */
export function normalizeName(s: string): string {
  const base = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\./g, "").replace(/[^A-Z0-9 ]+/g, " ");
  const words = base.split(/\s+/).filter(Boolean);
  const kept = words.filter((w) => !SUFFIXES.has(w));
  return (kept.length ? kept : words).join(" ");
}

/** RFC-4180 CSV rows; OFAC writes "-0-" for an empty field. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows.map((r) => r.map((f) => (f.trim() === "-0-" ? "" : f.trim())));
}

export type ListEntry = { ent_num: number; alt_num: number | null; name: string; sdn_type: string | null; program: string | null; remarks: string | null };

/** SDN.CSV: ent_num, name, type, program, title, call sign, vessel type, tonnage, GRT, flag, owner, remarks. ALT.CSV: ent_num, alt_num, alt_type, alt_name, remarks. */
export function entriesFromCsv(sdn: string, alt: string): ListEntry[] {
  const primary = parseCsv(sdn).filter((r) => /^\d+$/.test(r[0] ?? "") && r[1]);
  const byEnt = new Map(primary.map((r) => [Number(r[0]), r]));
  const out: ListEntry[] = primary.map((r) => ({ ent_num: Number(r[0]), alt_num: null, name: r[1]!, sdn_type: r[2] || null, program: r[3] || null, remarks: r[11] || null }));
  for (const r of parseCsv(alt)) {
    if (!/^\d+$/.test(r[0] ?? "") || !r[3]) continue;
    const p = byEnt.get(Number(r[0]));
    out.push({ ent_num: Number(r[0]), alt_num: Number(r[1]) || null, name: r[3], sdn_type: p?.[2] || null, program: p?.[3] || null, remarks: r[4] || null });
  }
  return out;
}

export type Fetcher = (url: string) => Promise<string>;
const httpFetch: Fetcher = async (url) => {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`OFAC list download failed: ${url} HTTP ${res.status}`);
  return await res.text();
};

/** Download SDN + ALT, keep a new load only when the content changed. Returns the load id and whether it was new. */
export async function loadSanctionsList(c: Q, uid: string | null, fetcher: Fetcher = httpFetch) {
  const [sdn, alt] = [await fetcher(OFAC_SDN_URL), await fetcher(OFAC_ALT_URL)];
  const entries = entriesFromCsv(sdn, alt);
  if (entries.length < 1000) throw new Error(`OFAC list looks truncated (${entries.length} names) — not loaded`);
  const sha = createHash("sha256").update(sdn).update("\n--ALT--\n").update(alt).digest("hex");
  const seen = await c.query<{ id: string }>(`SELECT id::text FROM scentsx.sanctions_list_loads WHERE content_sha256 = $1`, [sha]);
  if (seen.rows[0]) return { load_id: seen.rows[0].id, new_load: false, names: entries.length };
  const sdnRows = entries.filter((e) => e.alt_num == null).length;
  const load = await c.query<{ id: string }>(
    `INSERT INTO scentsx.sanctions_list_loads (source_url, published_on, sdn_rows, alt_rows, content_sha256, loaded_by, loaded_at)
     VALUES ($1, (now() AT TIME ZONE 'America/Chicago')::date, $2, $3, $4, $5::uuid, clock_timestamp()) RETURNING id::text`,
    [OFAC_SDN_URL, sdnRows, entries.length - sdnRows, sha, uid]
  );
  const loadId = load.rows[0]!.id;
  for (let i = 0; i < entries.length; i += 2000) {
    const b = entries.slice(i, i + 2000);
    await c.query(
      `INSERT INTO scentsx.sanctions_list_entries (load_id, ent_num, alt_num, name, name_norm, sdn_type, program, remarks)
       SELECT $1::uuid, * FROM unnest($2::int[], $3::int[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[])`,
      [loadId, b.map((e) => e.ent_num), b.map((e) => e.alt_num), b.map((e) => e.name), b.map((e) => normalizeName(e.name)),
       b.map((e) => e.sdn_type), b.map((e) => e.program), b.map((e) => e.remarks)]
    );
  }
  return { load_id: loadId, new_load: true, names: entries.length };
}

export type Party =
  | { kind: "contact_company"; id: string } | { kind: "customer"; id: string } | { kind: "vendor"; id: string } | { kind: "cash_payer"; id: string };
const COL: Record<Party["kind"], string> = { contact_company: "contact_company_id", customer: "customer_id", vendor: "vendor_id", cash_payer: "cash_payer_id" };

async function partyName(c: Q, p: Party): Promise<string> {
  const sql: Record<Party["kind"], string> = {
    contact_company: `SELECT name FROM perfume.contact_companies WHERE id = $1::uuid`,
    customer: `SELECT customer_name AS name FROM mdata.customers WHERE id = $1::uuid`,
    vendor: `SELECT vendor_name AS name FROM mdata.vendors WHERE id = $1::uuid`,
    cash_payer: `SELECT legal_name AS name FROM scentsx.cash_payers WHERE id = $1::uuid`,
  };
  const r = await c.query<{ name: string | null }>(sql[p.kind], [p.id]);
  const n = r.rows[0]?.name;
  if (!n) throw new ScentsxLinkNotFound();
  return n;
}

async function newestLoad(c: Q) {
  const r = await c.query<{ id: string }>(`SELECT id::text FROM scentsx.sanctions_list_loads ORDER BY loaded_at DESC LIMIT 1`);
  return r.rows[0]?.id ?? null;
}

export async function screenParty(c: Q, uid: string | null, p: Party) {
  const co = await scopeToScentsx(c);
  const load = await newestLoad(c);
  if (!load) throw new ScentsxLinkInvalid("the OFAC list has not been loaded yet — load it from the Compliance desk first");
  const name = await partyName(c, p);
  const norm = normalizeName(name);
  const hits = await c.query<{ ent_num: number; name: string; program: string | null; sdn_type: string | null; score: string }>(
    `SELECT ent_num, name, program, sdn_type, round(similarity(name_norm, $2)::numeric, 3)::text AS score
       FROM scentsx.sanctions_list_entries
      WHERE load_id = $1::uuid AND name_norm % $2 AND similarity(name_norm, $2) >= $3
      ORDER BY similarity(name_norm, $2) DESC LIMIT 10`,
    [load, norm, SANCTIONS_MATCH_THRESHOLD]
  );
  const best = hits.rows.length ? Number(hits.rows[0]!.score) : 0;
  const result = hits.rows.length ? "possible_match" : "clear";
  const r = await c.query<{ id: string }>(
    `INSERT INTO scentsx.sanctions_screenings (operating_company_id, party_kind, ${COL[p.kind]}, screened_name, list_load_id, threshold, best_score, hits, result, created_by)
     VALUES ($1::uuid, $2, $3::uuid, $4, $5::uuid, $6, $7, $8::jsonb, $9, $10::uuid) RETURNING id::text`,
    [co, p.kind, p.id, name, load, SANCTIONS_MATCH_THRESHOLD, best, JSON.stringify(hits.rows.map((h) => ({ ...h, score: Number(h.score) }))), result, uid]
  );
  return { screening_id: r.rows[0]!.id, result, best_score: best, hits: hits.rows.length };
}

export type PartyStatus = { blocked: boolean; reason: "never_screened" | "list_changed" | "possible_match" | "confirmed_match" | null; screening_id: string | null };

export async function partyStatus(c: Q, p: Party): Promise<PartyStatus> {
  await scopeToScentsx(c);
  const load = await newestLoad(c);
  const r = await c.query<{ id: string; list_load_id: string; result: string; cleared_at: string | null; confirmed_match_at: string | null }>(
    `SELECT id::text, list_load_id::text, result, cleared_at, confirmed_match_at FROM scentsx.sanctions_screenings
      WHERE ${COL[p.kind]} = $1::uuid ORDER BY created_at DESC LIMIT 1`, [p.id]
  );
  const s = r.rows[0];
  if (!s) return { blocked: true, reason: "never_screened", screening_id: null };
  if (s.confirmed_match_at) return { blocked: true, reason: "confirmed_match", screening_id: s.id };
  if (s.result === "possible_match" && !s.cleared_at) return { blocked: true, reason: "possible_match", screening_id: s.id };
  if (load && s.list_load_id !== load) return { blocked: true, reason: "list_changed", screening_id: s.id };
  return { blocked: false, reason: null, screening_id: s.id };
}

/** Throws when the party may not be sold to / bought from / paid by. Used by the invoice, receipt and PO paths. */
export async function assertNotSanctionsBlocked(c: Q, p: Party, what: string) {
  const s = await partyStatus(c, p);
  if (!s.blocked) return;
  const why = { never_screened: "has not been screened against the OFAC list", list_changed: "has not been screened against the newest OFAC list",
    possible_match: "is a possible OFAC match the owner has not cleared", confirmed_match: "is a confirmed OFAC match" }[s.reason!];
  throw new ScentsxLinkInvalid(`${what}: this party ${why}. Screen or clear it on the Compliance desk.`);
}

export async function clearScreening(c: Q, uid: string, screeningId: string, reason: string) {
  await scopeToScentsx(c);
  if (reason.trim().length < 10) throw new ScentsxLinkInvalid("say why this is not the listed person or company (at least a sentence)");
  const r = await c.query(
    `UPDATE scentsx.sanctions_screenings SET cleared_at = now(), cleared_by = $2::uuid, clear_reason = $3
      WHERE id = $1::uuid AND result = 'possible_match' AND cleared_at IS NULL AND confirmed_match_at IS NULL`, [screeningId, uid, reason.trim()]
  );
  if (!r.rowCount) throw new ScentsxLinkInvalid("screening not found, not a possible match, or already decided");
  return { cleared: true };
}

export async function confirmMatch(c: Q, uid: string, screeningId: string) {
  await scopeToScentsx(c);
  const r = await c.query(
    `UPDATE scentsx.sanctions_screenings SET confirmed_match_at = now(), confirmed_by = $2::uuid
      WHERE id = $1::uuid AND result = 'possible_match' AND cleared_at IS NULL AND confirmed_match_at IS NULL`, [screeningId, uid]
  );
  if (!r.rowCount) throw new ScentsxLinkInvalid("screening not found, not a possible match, or already decided");
  return { confirmed: true };
}

/** Screen every ScentsX party that is not screened against the newest list: linked customers + vendors, cash payers. */
export async function rescreenAll(c: Q, uid: string | null) {
  await scopeToScentsx(c);
  const load = await newestLoad(c);
  if (!load) return { screened: 0, possible_matches: 0 };
  const parties = await c.query<{ kind: Party["kind"]; id: string }>(
    `SELECT 'customer' AS kind, l.customer_id::text AS id FROM scentsx.customer_links l WHERE l.voided_at IS NULL
     UNION SELECT 'vendor', l.vendor_id::text FROM scentsx.vendor_links l WHERE l.voided_at IS NULL
     UNION SELECT 'cash_payer', p.id::text FROM scentsx.cash_payers p WHERE p.voided_at IS NULL`
  );
  let screened = 0, matches = 0;
  for (const p of parties.rows) {
    const last = await c.query<{ list_load_id: string }>(
      `SELECT list_load_id::text FROM scentsx.sanctions_screenings WHERE ${COL[p.kind]} = $1::uuid ORDER BY created_at DESC LIMIT 1`, [p.id]
    );
    if (last.rows[0]?.list_load_id === load) continue;
    const r = await screenParty(c, uid, { kind: p.kind, id: p.id } as Party);
    screened++; if (r.result === "possible_match") matches++;
  }
  return { screened, possible_matches: matches };
}

// ---- Texas resale certificates + export proof ---------------------------------------------------------------------------

export async function addResaleCertificate(c: Q, uid: string, input: { contact_company_id: string; customer_id?: string | null; form_code?: "01-339" | "out_of_state" | "mexico_export_buyer"; purchaser_tax_id?: string | null; signed_on: string; file_id: string; notes?: string | null }) {
  const co = await scopeToScentsx(c);
  const r = await c.query<{ id: string }>(
    `INSERT INTO scentsx.resale_certificates (operating_company_id, contact_company_id, customer_id, form_code, purchaser_tax_id, signed_on, file_id, notes, created_by)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6::date, $7::uuid, $8, $9::uuid) RETURNING id::text`,
    [co, input.contact_company_id, input.customer_id ?? null, input.form_code ?? "01-339", input.purchaser_tax_id ?? null, input.signed_on, input.file_id, input.notes ?? null, uid]
  );
  return { id: r.rows[0]!.id };
}

export async function addExportProof(c: Q, uid: string, input: { sales_order_id: string; invoice_id?: string | null; proof_kind: "broker_export_certification" | "foreign_import_papers" | "bill_of_lading_outside_us"; document_number?: string | null; crossed_on?: string | null; port?: string | null; file_id: string; notes?: string | null }) {
  const co = await scopeToScentsx(c);
  const r = await c.query<{ id: string }>(
    `INSERT INTO scentsx.export_proofs (operating_company_id, sales_order_id, invoice_id, proof_kind, document_number, crossed_on, port, file_id, notes, created_by)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6::date, $7, $8::uuid, $9, $10::uuid) RETURNING id::text`,
    [co, input.sales_order_id, input.invoice_id ?? null, input.proof_kind, input.document_number ?? null, input.crossed_on ?? null, input.port ?? null, input.file_id, input.notes ?? null, uid]
  );
  return { id: r.rows[0]!.id };
}

export async function voidTaxDocument(c: Q, uid: string, kind: "resale_certificates" | "export_proofs", id: string, reason: string) {
  await scopeToScentsx(c);
  if (!reason.trim()) throw new ScentsxLinkInvalid("a void needs a reason");
  const r = await c.query(`UPDATE scentsx.${kind} SET voided_at = now(), voided_by = $2::uuid, void_reason = $3 WHERE id = $1::uuid AND voided_at IS NULL`, [id, uid, reason.trim()]);
  if (!r.rowCount) throw new ScentsxLinkNotFound();
  return { voided: true };
}

export async function hasExportProof(c: Q, salesOrderId: string) {
  const r = await c.query(`SELECT 1 FROM scentsx.export_proofs WHERE sales_order_id = $1::uuid AND voided_at IS NULL LIMIT 1`, [salesOrderId]);
  return (r.rowCount ?? 0) > 0;
}

export async function hasResaleCertificate(c: Q, contactCompanyId: string) {
  const r = await c.query(`SELECT 1 FROM scentsx.resale_certificates WHERE contact_company_id = $1::uuid AND voided_at IS NULL LIMIT 1`, [contactCompanyId]);
  return (r.rowCount ?? 0) > 0;
}

export async function sanctionsDesk(c: Q) {
  await scopeToScentsx(c);
  const load = await c.query(`SELECT id::text, source_url, published_on::text, sdn_rows, alt_rows, loaded_at FROM scentsx.sanctions_list_loads ORDER BY loaded_at DESC LIMIT 1`);
  const open = await c.query(
    `SELECT s.id::text, s.party_kind, s.screened_name, s.best_score::float8 AS best_score, s.hits, s.created_at,
            s.contact_company_id::text, s.customer_id::text, s.vendor_id::text, s.cash_payer_id::text
       FROM scentsx.sanctions_screenings s
      WHERE s.result = 'possible_match' AND s.cleared_at IS NULL AND s.confirmed_match_at IS NULL ORDER BY s.created_at DESC LIMIT 200`
  );
  const recent = await c.query(
    `SELECT s.id::text, s.party_kind, s.screened_name, s.result, s.best_score::float8 AS best_score, s.created_at, s.cleared_at, s.clear_reason, s.confirmed_match_at
       FROM scentsx.sanctions_screenings s ORDER BY s.created_at DESC LIMIT 200`
  );
  return { list: load.rows[0] ?? null, open_matches: open.rows, recent: recent.rows };
}
