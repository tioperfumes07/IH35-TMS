#!/usr/bin/env node
/**
 * PERFUME-CONTACTS import (owner 2026-11-25 22:04 / 22:11 CT; research session ROUND P1.4 #6-7, P1.6).
 *
 * Loads a normalized JSON-lines file into perfume.contact_companies / contact_people / contact_origins — the Master
 * Database (7,395 rows from the 7 TIO mailboxes, phones and the market directory) and the INEGI DENUE pull. One record per
 * line: { company: {...}, people: [...], origins: [...] } (see toRecord in the converter, not here — this file only loads).
 *
 * Dedupe, in the order the research session set (P1.4 #6): outside key (INEGI id) → Google place_id → phone last 10 digits →
 * lower(email) → same web domain → perfume.name_key(name) + city. A match FILLS BLANKS only (never overwrites a value the
 * company already has), merges the role (vendor + customer = both), adds its people (one email = one person, never twice)
 * and adds the new origin rows. Nothing is deleted.
 *
 * Runs as the desk owner under the Lucia bypass (perfume is owner-only RLS). Each batch is one transaction.
 *
 *   DATABASE_URL=… node scripts/perfume-contacts-import.mjs <file.jsonl> [--dry-run]
 *   prints: records, companies inserted, companies matched (by key), people inserted, people already there, origins inserted
 */
import fs from "node:fs";
import readline from "node:readline";
import pg from "pg";

const file = process.argv[2];
const dry = process.argv.includes("--dry-run");
if (!file || !process.env.DATABASE_URL) { console.error("usage: DATABASE_URL=… node scripts/perfume-contacts-import.mjs <file.jsonl> [--dry-run]"); process.exit(2); }

const FREE_MAIL = new Set(["gmail.com", "hotmail.com", "yahoo.com", "outlook.com", "aol.com", "icloud.com", "me.com", "live.com", "msn.com", "prodigy.net.mx",
  "hotmail.es", "yahoo.com.mx", "live.com.mx", "outlook.es", "comcast.net", "att.net", "sbcglobal.net", "verizon.net", "mail.com", "protonmail.com", "usa.com"]);
export const phone10 = (s) => { const d = String(s ?? "").replace(/\D/g, ""); return d.length >= 10 ? d.slice(-10) : null; };
const ROLE_MERGE = (a, b) => (!a ? b ?? null : !b || a === b ? a : "both");

const COMPANY_COLS = ["name", "domain", "role", "vendor_type", "customer_type", "main_category", "address", "city", "state", "zip", "country", "region", "website",
  "phone", "phone_intl", "maps_uri", "google_place_id", "linkedin", "owner_name", "status", "source", "first_contact_on", "last_email_on", "notes",
  "external_source", "external_id", "external_ref", "segment", "scian_code"];

async function findCompany(c, rec) {
  const co = rec.company;
  // Two different ids from the same directory are two different businesses (two "Sin Nombre" beer depots on one street, two
  // branches sharing a phone): they never merge with each other — only with records from another source.
  const src = co.external_id ? co.external_source : null;
  const NOT_SAME_DIR = src ? ` AND (external_source IS DISTINCT FROM '${src.replace(/'/g, "''")}' OR external_id IS NULL)` : "";
  const q1 = async (sql, args) => (await c.query(sql.replaceAll("/*dir*/", NOT_SAME_DIR), args)).rows[0]?.id ?? null;
  if (co.external_id) { const id = await q1(`SELECT id FROM perfume.contact_companies WHERE external_source = $1 AND external_id = $2`, [co.external_source, co.external_id]); if (id) return [id, "outside key"]; }
  if (co.google_place_id) { const id = await q1(`SELECT id FROM perfume.contact_companies WHERE google_place_id = $1`, [co.google_place_id]); if (id) return [id, "place_id"]; }
  const phones = [...new Set([co.phone, ...rec.people.flatMap((p) => p.phones ?? [])].map(phone10).filter(Boolean))];
  for (const p of phones) {
    const id = await q1(
      `SELECT id FROM perfume.contact_companies WHERE archived_at IS NULL AND right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) = $1 /*dir*/
       UNION ALL SELECT p.company_id FROM perfume.contact_people p WHERE p.archived_at IS NULL
         AND p.phone_keys @> ARRAY[$1::text]
         AND p.company_id IN (SELECT id FROM perfume.contact_companies WHERE true /*dir*/) LIMIT 1`, [p]);
    if (id) return [id, "phone"];
  }
  for (const e of rec.people.map((p) => p.email).filter(Boolean)) {
    const id = await q1(`SELECT company_id AS id FROM perfume.contact_people WHERE email = $1 AND archived_at IS NULL
      AND company_id IN (SELECT id FROM perfume.contact_companies WHERE true /*dir*/)`, [e]);
    if (id) return [id, "email"];
  }
  if (co.domain && !FREE_MAIL.has(co.domain)) {
    const id = await q1(`SELECT id FROM perfume.contact_companies WHERE domain = $1 AND archived_at IS NULL /*dir*/ ORDER BY created_at LIMIT 1`, [co.domain]);
    if (id) return [id, "domain"];
  }
  if (co.city) {
    const id = await q1(`SELECT id FROM perfume.contact_companies WHERE archived_at IS NULL AND name_key = perfume.name_key($1) AND lower(city) = lower($2) /*dir*/ LIMIT 1`, [co.name, co.city]);
    if (id) return [id, "name + city"];
  }
  return [null, null];
}

async function load(c, rec, owner, t) {
  const co = rec.company;
  let [id, how] = await findCompany(c, rec);
  if (id) {
    t.matched += 1; t.by[how] = (t.by[how] ?? 0) + 1;
    const cur = (await c.query(`SELECT role FROM perfume.contact_companies WHERE id = $1`, [id])).rows[0];
    const sets = COMPANY_COLS.filter((k) => !["name", "source", "role", "status", "first_contact_on", "last_email_on", "external_source", "external_id"].includes(k));
    await c.query(
      `UPDATE perfume.contact_companies SET ${sets.map((k, i) => `${k} = coalesce(${k}, $${i + 2})`).join(", ")},
          role = $${sets.length + 2}, categories = (SELECT array(SELECT DISTINCT unnest(categories || $${sets.length + 3}::text[]))),
          brands = (SELECT array(SELECT DISTINCT unnest(brands || $${sets.length + 4}::text[]))),
          first_contact_on = LEAST(first_contact_on, $${sets.length + 5}::date), last_email_on = GREATEST(last_email_on, $${sets.length + 6}::date),
          external_source = coalesce(external_source, $${sets.length + 7}), external_id = coalesce(external_id, $${sets.length + 8}), updated_at = now()
        WHERE id = $1`,
      [id, ...sets.map((k) => co[k] ?? null), ROLE_MERGE(cur.role, co.role ?? null), co.categories ?? [], co.brands ?? [],
        co.first_contact_on ?? null, co.last_email_on ?? null, co.external_source ?? null, co.external_id ?? null]);
  } else {
    const cols = COMPANY_COLS.filter((k) => co[k] != null);
    const r = await c.query(
      `INSERT INTO perfume.contact_companies (${[...cols, "categories", "brands", "created_by"].join(", ")})
       VALUES (${[...cols, "categories", "brands", "created_by"].map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id`,
      [...cols.map((k) => co[k]), co.categories ?? [], co.brands ?? [], owner]);
    id = r.rows[0].id; t.inserted += 1;
  }
  const personIds = [];
  for (const p of rec.people) {
    let pid = null;
    if (p.email) pid = (await c.query(`SELECT id FROM perfume.contact_people WHERE email = $1 AND archived_at IS NULL`, [p.email])).rows[0]?.id ?? null;
    if (pid) { t.people_existing += 1; personIds.push(pid); continue; }
    if (!p.email && !(p.phones ?? []).length && !p.name) { personIds.push(null); continue; }
    const r = await c.query(
      `INSERT INTO perfume.contact_people (company_id, name, title, email, other_emails, phones, role, how_started, found_in, first_contact_on, last_email_on,
          email_count, sent_lists, opted_out_at, master_row, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING id`,
      [id, p.name ?? null, p.title ?? null, p.email ?? null, p.other_emails ?? [], p.phones ?? [], p.role ?? null, p.how_started ?? null, p.found_in ?? null,
        p.first_contact_on ?? null, p.last_email_on ?? null, p.email_count ?? null, Boolean(p.sent_lists), p.opted_out ? new Date() : null, p.master_row ?? null, owner]);
    personIds.push(r.rows[0].id); t.people_inserted += 1;
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

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: true } });
  await client.connect();
  const t = { records: 0, inserted: 0, matched: 0, by: {}, people_inserted: 0, people_existing: 0, origins: 0 };
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  let batch = [];
  let owner = null;
  const flush = async () => {
    if (!batch.length) return;
    await client.query("BEGIN");
    try {
      await client.query("SET LOCAL app.bypass_rls = 'lucia'");
      if (!owner) owner = (await client.query(`SELECT user_id FROM perfume.desk_users ORDER BY added_at LIMIT 1`)).rows[0]?.user_id ?? null;
      for (const rec of batch) { await load(client, rec, owner, t); t.records += 1; }
      await client.query(dry ? "ROLLBACK" : "COMMIT");
    } catch (e) { await client.query("ROLLBACK"); throw e; }
    batch = [];
    process.stderr.write(`\r${t.records} records · ${t.inserted} new · ${t.matched} matched`);
  };
  for await (const line of rl) {
    if (!line.trim()) continue;
    batch.push(JSON.parse(line));
    if (batch.length >= 250) await flush();
  }
  await flush();
  await client.end();
  process.stderr.write("\n");
  console.log(JSON.stringify({ file, dry_run: dry, ...t }));
}

main().catch((e) => { console.error(e); process.exit(1); });
