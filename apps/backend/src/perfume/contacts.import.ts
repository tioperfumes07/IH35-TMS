/**
 * PERFUME-CONTACTS import (owner 2026-11-25 22:04 / 22:11 CT; research session ROUND P1.4 #6-7, P1.6) — runs INSIDE the app as
 * the desk owner, from the Contacts tab ("Import contacts file"), so no one connects to the database by hand.
 *
 * Loads normalized records into perfume.contact_companies / contact_people / contact_origins — the Master Database (7 TIO
 * mailboxes, phones, market directory) and the INEGI DENUE pull. One record = { company, people, origins }.
 *
 * Dedupe, in the order the research session set (P1.4 #6): outside key (INEGI id) → Google place_id → phone last 10 digits →
 * lower(email) → same web domain → perfume.name_key(name) + city. Two different ids from the same directory never merge with
 * each other. A match FILLS BLANKS only, merges the role (vendor + customer = both), adds its people (one email = one person,
 * never twice) and the new origin rows. Nothing is deleted.
 */
import type pg from "pg";
import { z } from "zod";

const str = z.string().trim().max(2000).nullable().optional();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();
export const importRecordSchema = z.object({
  company: z.object({
    name: z.string().trim().min(1).max(300), domain: str, role: z.enum(["vendor", "customer", "both"]).nullable().optional(),
    vendor_type: str, customer_type: str, main_category: str, address: str, city: str, state: str, zip: str, country: str, region: str, website: str,
    phone: str, phone_intl: str, maps_uri: str, google_place_id: str, linkedin: str, owner_name: str,
    status: z.enum(["prospect", "active", "dormant", "do_not_email"]).nullable().optional(), source: z.string().trim().min(1).max(120),
    first_contact_on: date, last_email_on: date, notes: z.string().max(5000).nullable().optional(),
    external_source: str, external_id: str, external_ref: z.record(z.string(), z.unknown()).nullable().optional(), segment: str, scian_code: str,
    categories: z.array(z.string().max(200)).max(50).optional(), brands: z.array(z.string().max(200)).max(200).optional(),
  }),
  people: z.array(z.object({
    name: str, title: str, email: z.string().trim().toLowerCase().max(320).regex(/^[^@\s]+@[^@\s]+$/).nullable().optional(),
    other_emails: z.array(z.string().max(320)).max(20).optional(), phones: z.array(z.string().max(60)).max(20).optional(),
    role: z.enum(["vendor", "customer", "both"]).nullable().optional(), how_started: str, found_in: z.string().max(2000).nullable().optional(),
    first_contact_on: date, last_email_on: date, email_count: z.number().int().min(0).nullable().optional(), sent_lists: z.boolean().optional(),
    opted_out: z.boolean().optional(), master_row: z.number().int().nullable().optional(),
  })).max(50),
  origins: z.array(z.object({
    person_index: z.number().int().min(0).nullable().optional(), occurred_on: date, how: z.string().trim().min(1).max(200),
    source: z.string().trim().min(1).max(300), source_url: z.string().max(2000).nullable().optional(), detail: z.string().max(2000).nullable().optional(),
  })).max(50).optional(),
});
export type ImportRecord = z.infer<typeof importRecordSchema>;
export type ImportTally = { records: number; inserted: number; matched: number; by: Record<string, number>; people_inserted: number; people_existing: number; origins: number };
export const emptyTally = (): ImportTally => ({ records: 0, inserted: 0, matched: 0, by: {}, people_inserted: 0, people_existing: 0, origins: 0 });

const FREE_MAIL = new Set(["gmail.com", "hotmail.com", "yahoo.com", "outlook.com", "aol.com", "icloud.com", "me.com", "live.com", "msn.com", "prodigy.net.mx",
  "hotmail.es", "yahoo.com.mx", "live.com.mx", "outlook.es", "comcast.net", "att.net", "sbcglobal.net", "verizon.net", "mail.com", "protonmail.com", "usa.com"]);
const phone10 = (s: unknown) => { const d = String(s ?? "").replace(/\D/g, ""); return d.length >= 10 ? d.slice(-10) : null; };
const ROLE_MERGE = (a: string | null, b: string | null) => (!a ? b ?? null : !b || a === b ? a : "both");

const COMPANY_COLS: Array<keyof ImportRecord["company"]> = ["name", "domain", "role", "vendor_type", "customer_type", "main_category", "address", "city", "state", "zip", "country", "region", "website",
  "phone", "phone_intl", "maps_uri", "google_place_id", "linkedin", "owner_name", "status", "source", "first_contact_on", "last_email_on", "notes",
  "external_source", "external_id", "external_ref", "segment", "scian_code"];

async function findCompany(c: pg.PoolClient, rec: ImportRecord): Promise<[string | null, string | null]> {
  const co = rec.company;
  // Two different ids from the same directory are two different businesses (two "Sin Nombre" beer depots on one street, two
  // branches sharing a phone): they never merge with each other — only with records from another source.
  const src = co.external_id ? co.external_source : null;
  const NOT_SAME_DIR = src ? ` AND (external_source IS DISTINCT FROM '${src.replace(/'/g, "''")}' OR external_id IS NULL)` : "";
  const q1 = async (sql: string, args: unknown[]): Promise<string | null> => ((await c.query<{ id: string }>(sql.replaceAll("/*dir*/", NOT_SAME_DIR), args)).rows[0]?.id ?? null);
  if (co.external_id) { const id = await q1(`SELECT id FROM perfume.contact_companies WHERE external_source = $1 AND external_id = $2`, [co.external_source, co.external_id]); if (id) return [id, "outside key"]; }
  if (co.google_place_id) { const id = await q1(`SELECT id FROM perfume.contact_companies WHERE google_place_id = $1`, [co.google_place_id]); if (id) return [id, "place_id"]; }
  const phones = [...new Set([co.phone, ...rec.people.flatMap((p) => p.phones ?? [])].map(phone10).filter((x): x is string => Boolean(x)))];
  for (const p of phones) {
    const id = await q1(
      `SELECT id FROM perfume.contact_companies WHERE archived_at IS NULL AND right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) = $1 /*dir*/
       UNION ALL SELECT p.company_id FROM perfume.contact_people p WHERE p.archived_at IS NULL
         AND p.phone_keys @> ARRAY[$1::text]
         AND p.company_id IN (SELECT id FROM perfume.contact_companies WHERE true /*dir*/) LIMIT 1`, [p]);
    if (id) return [id, "phone"];
  }
  for (const e of rec.people.map((p) => p.email).filter((x): x is string => Boolean(x))) {
    const id = await q1(`SELECT company_id AS id FROM perfume.contact_people WHERE email = $1 AND archived_at IS NULL
      AND company_id IN (SELECT id FROM perfume.contact_companies WHERE true /*dir*/)`, [e]);
    if (id) return [id, "email"];
  }
  if (co.domain && !FREE_MAIL.has(String(co.domain))) {
    const id = await q1(`SELECT id FROM perfume.contact_companies WHERE domain = $1 AND archived_at IS NULL /*dir*/ ORDER BY created_at LIMIT 1`, [co.domain]);
    if (id) return [id, "domain"];
  }
  if (co.city) {
    const id = await q1(`SELECT id FROM perfume.contact_companies WHERE archived_at IS NULL AND name_key = perfume.name_key($1) AND lower(city) = lower($2) /*dir*/ LIMIT 1`, [co.name, co.city]);
    if (id) return [id, "name + city"];
  }
  return [null, null];
}

async function load(c: pg.PoolClient, rec: ImportRecord, owner: string, t: ImportTally) {
  const co = rec.company;
  let [id, how] = await findCompany(c, rec);
  if (id) {
    t.matched += 1; t.by[how!] = (t.by[how!] ?? 0) + 1;
    const cur = (await c.query<{ role: string | null }>(`SELECT role FROM perfume.contact_companies WHERE id = $1`, [id])).rows[0]!;
    const sets = COMPANY_COLS.filter((k) => !["name", "source", "role", "status", "first_contact_on", "last_email_on", "external_source", "external_id"].includes(k));
    await c.query(
      `UPDATE perfume.contact_companies SET ${sets.map((k, i) => `${k} = coalesce(${k}, $${i + 2})`).join(", ")},
          role = $${sets.length + 2}, categories = (SELECT array(SELECT DISTINCT unnest(categories || $${sets.length + 3}::text[]))),
          brands = (SELECT array(SELECT DISTINCT unnest(brands || $${sets.length + 4}::text[]))),
          first_contact_on = LEAST(first_contact_on, $${sets.length + 5}::date), last_email_on = GREATEST(last_email_on, $${sets.length + 6}::date),
          external_source = coalesce(external_source, $${sets.length + 7}), external_id = coalesce(external_id, $${sets.length + 8}), updated_at = now()
        WHERE id = $1`,
      [id, ...sets.map((k) => (k === "external_ref" && co[k] != null ? JSON.stringify(co[k]) : co[k] ?? null)), ROLE_MERGE(cur.role, (co.role as string | null) ?? null), co.categories ?? [], co.brands ?? [],
        co.first_contact_on ?? null, co.last_email_on ?? null, co.external_source ?? null, co.external_id ?? null]);
  } else {
    const cols = COMPANY_COLS.filter((k) => co[k] != null);
    const r = await c.query<{ id: string }>(
      `INSERT INTO perfume.contact_companies (${[...cols, "categories", "brands", "created_by"].join(", ")})
       VALUES (${[...cols, "categories", "brands", "created_by"].map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id`,
      [...cols.map((k) => (k === "external_ref" && co[k] != null ? JSON.stringify(co[k]) : co[k])), co.categories ?? [], co.brands ?? [], owner]);
    id = r.rows[0]!.id; t.inserted += 1;
  }
  const personIds: Array<string | null> = [];
  for (const p of rec.people) {
    let pid: string | null = null;
    if (p.email) pid = (await c.query<{ id: string }>(`SELECT id FROM perfume.contact_people WHERE email = $1 AND archived_at IS NULL`, [p.email])).rows[0]?.id ?? null;
    if (pid) { t.people_existing += 1; personIds.push(pid); continue; }
    if (!p.email && !(p.phones ?? []).length && !p.name) { personIds.push(null); continue; }
    const r = await c.query<{ id: string }>(
      `INSERT INTO perfume.contact_people (company_id, name, title, email, other_emails, phones, role, how_started, found_in, first_contact_on, last_email_on,
          email_count, sent_lists, opted_out_at, master_row, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING id`,
      [id, p.name ?? null, p.title ?? null, p.email ?? null, p.other_emails ?? [], p.phones ?? [], p.role ?? null, p.how_started ?? null, p.found_in ?? null,
        p.first_contact_on ?? null, p.last_email_on ?? null, p.email_count ?? null, Boolean(p.sent_lists), p.opted_out ? new Date() : null, p.master_row ?? null, owner]);
    personIds.push(r.rows[0]!.id); t.people_inserted += 1;
  }
  for (const o of rec.origins ?? []) {
    const pid = o.person_index != null ? personIds[o.person_index] ?? null : null;
    const dup = await c.query(
      `SELECT 1 FROM perfume.contact_origins WHERE company_id = $1 AND how = $2 AND source = $3 AND person_id IS NOT DISTINCT FROM $4 AND occurred_on IS NOT DISTINCT FROM $5::date LIMIT 1`,
      [id, o.how, o.source, pid, o.occurred_on ?? null]);
    if (dup.rowCount) continue;
    await c.query(
      `INSERT INTO perfume.contact_origins (company_id, person_id, occurred_on, how, source, source_url, detail, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, pid, o.occurred_on ?? null, o.how, o.source, o.source_url ?? null, o.detail ?? null, owner]);
    t.origins += 1;
  }
}


/** One batch, already inside the caller's owner transaction. */
export async function importRecords(c: pg.PoolClient, records: ImportRecord[], ownerUid: string, t: ImportTally = emptyTally()): Promise<ImportTally> {
  for (const rec of records) { await load(c, rec, ownerUid, t); t.records += 1; }
  return t;
}
