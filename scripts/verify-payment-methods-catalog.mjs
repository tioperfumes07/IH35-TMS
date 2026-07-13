#!/usr/bin/env node
/**
 * Payment-methods CATALOG guard (Phase 4 GUARDS, Settlement Pay-Run — migration 202607380000).
 *
 * catalogs.payment_methods is the owner-editable payment-method catalog (QBO pattern). Locks:
 *   (1) ENTITY-SCOPED: operating_company_id uuid NOT NULL REFERENCES org.companies(id).
 *   (2) FORCE ROW LEVEL SECURITY (not just ENABLE — FORCE, so even the table owner is scoped).
 *   (3) GRANTs SELECT/INSERT/UPDATE to ih35_app with NO DELETE (void-not-delete via voided_at).
 *   (4) The seed is EXISTS-guarded via a CROSS JOIN on org.companies, so a fresh CI DB (0 companies)
 *       seeds 0 rows — never a hardcoded/unconditional seed that would insert on an empty DB.
 *   (5) UNIQUE (operating_company_id, lower(name)) — one method name per entity, case-insensitive.
 *
 * --selftest exercises assertGuard() against inline fixtures (pass + each failure mode).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-payment-methods-catalog";
const MIGRATION = "db/migrations/202607380000_settlement_payrun_catalog_and_extends.sql";
const TABLE = "catalogs.payment_methods";

/**
 * Pure evaluation.
 * @param {{ migration: string }} args
 * @returns {string[]} errors
 */
export function assertGuard({ migration }) {
  const errors = [];

  if (!/CREATE TABLE IF NOT EXISTS\s+catalogs\.payment_methods/.test(migration)) {
    errors.push(`${MIGRATION}: ${TABLE} table not created (idempotent CREATE TABLE IF NOT EXISTS)`);
  }

  // (1) entity-scoped
  if (!/operating_company_id\s+uuid\s+NOT NULL\s+REFERENCES\s+org\.companies\s*\(\s*id\s*\)/i.test(migration)) {
    errors.push(`${MIGRATION}: ${TABLE} must have operating_company_id uuid NOT NULL REFERENCES org.companies(id)`);
  }

  // (2) FORCE ROW LEVEL SECURITY
  if (!/ALTER TABLE\s+catalogs\.payment_methods\s+FORCE ROW LEVEL SECURITY/i.test(migration)) {
    errors.push(`${MIGRATION}: ${TABLE} must FORCE ROW LEVEL SECURITY`);
  }

  // (3) grants SELECT/INSERT/UPDATE, no DELETE
  const grant = /GRANT\s+([A-Z,\s]+?)\s+ON\s+catalogs\.payment_methods\s+TO\s+ih35_app/i.exec(migration);
  if (!grant) {
    errors.push(`${MIGRATION}: missing GRANT ... ON ${TABLE} TO ih35_app`);
  } else {
    const verbs = grant[1].toUpperCase();
    if (/\bDELETE\b/.test(verbs)) {
      errors.push(`${MIGRATION}: grants on ${TABLE} must NOT include DELETE (void-not-delete)`);
    }
    for (const v of ["SELECT", "INSERT", "UPDATE"]) {
      if (!new RegExp(`\\b${v}\\b`).test(verbs)) {
        errors.push(`${MIGRATION}: grants on ${TABLE} must include ${v}`);
      }
    }
  }

  // (4) seed EXISTS-guarded via CROSS JOIN org.companies (a fresh CI DB w/ 0 companies seeds 0 rows)
  if (
    !/INSERT INTO\s+catalogs\.payment_methods[\s\S]{0,600}?FROM\s+org\.companies[\s\S]{0,300}?CROSS JOIN/i.test(migration)
  ) {
    errors.push(
      `${MIGRATION}: seed must be an INSERT ... FROM org.companies ... CROSS JOIN (VALUES ...) so a fresh ` +
        "CI DB with 0 companies seeds 0 rows"
    );
  }

  // (5) UNIQUE (operating_company_id, lower(name))
  if (
    !/CREATE UNIQUE INDEX[\s\S]{0,150}?ON\s+catalogs\.payment_methods\s*\(\s*operating_company_id\s*,\s*lower\(\s*name\s*\)\s*\)/i.test(
      migration
    )
  ) {
    errors.push(`${MIGRATION}: missing UNIQUE (operating_company_id, lower(name)) index on ${TABLE}`);
  }

  return errors;
}

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

function selftest() {
  const good = `
CREATE TABLE IF NOT EXISTS catalogs.payment_methods (
  id                   uuid NOT NULL DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  name                 text NOT NULL CHECK (length(trim(name)) > 0),
  gl_account_id        uuid NULL REFERENCES catalogs.accounts(id),
  is_active            boolean NOT NULL DEFAULT true,
  voided_at            timestamptz NULL,
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_methods_company_lower_name
  ON catalogs.payment_methods (operating_company_id, lower(name));

ALTER TABLE catalogs.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.payment_methods FORCE ROW LEVEL SECURITY;
CREATE POLICY payment_methods_tenant_scope ON catalogs.payment_methods
FOR ALL TO ih35_app
USING ( operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid );
GRANT SELECT, INSERT, UPDATE ON catalogs.payment_methods TO ih35_app;

INSERT INTO catalogs.payment_methods (operating_company_id, name, sort_order)
SELECT c.id, m.name, m.ord
FROM org.companies c
CROSS JOIN (VALUES ('ACH', 1), ('Wire', 2)) AS m(name, ord)
ON CONFLICT (operating_company_id, lower(name)) DO NOTHING;
`;

  const cases = [
    { name: "well-formed → 0 errors", in: { migration: good }, want: 0 },
    { name: "missing table create", in: { migration: good.replace("CREATE TABLE IF NOT EXISTS catalogs.payment_methods", "CREATE TABLE catalogs.other_table") }, wantMin: 1 },
    { name: "not entity-scoped (no operating_company_id FK)", in: { migration: good.replace("operating_company_id uuid NOT NULL REFERENCES org.companies(id),", "") }, wantMin: 1 },
    { name: "no FORCE RLS", in: { migration: good.replace("ALTER TABLE catalogs.payment_methods FORCE ROW LEVEL SECURITY;", "") }, wantMin: 1 },
    { name: "grants DELETE", in: { migration: good.replace("GRANT SELECT, INSERT, UPDATE ON catalogs.payment_methods TO ih35_app;", "GRANT SELECT, INSERT, UPDATE, DELETE ON catalogs.payment_methods TO ih35_app;") }, wantMin: 1 },
    { name: "grants missing UPDATE", in: { migration: good.replace("GRANT SELECT, INSERT, UPDATE ON catalogs.payment_methods TO ih35_app;", "GRANT SELECT, INSERT ON catalogs.payment_methods TO ih35_app;") }, wantMin: 1 },
    {
      name: "seed NOT exists-guarded (unconditional VALUES insert, no CROSS JOIN org.companies)",
      in: {
        migration: good.replace(
          `INSERT INTO catalogs.payment_methods (operating_company_id, name, sort_order)\nSELECT c.id, m.name, m.ord\nFROM org.companies c\nCROSS JOIN (VALUES ('ACH', 1), ('Wire', 2)) AS m(name, ord)\nON CONFLICT (operating_company_id, lower(name)) DO NOTHING;`,
          `INSERT INTO catalogs.payment_methods (operating_company_id, name, sort_order) VALUES ('11111111-1111-1111-1111-111111111111', 'ACH', 1);`
        ),
      },
      wantMin: 1,
    },
    { name: "no unique (operating_company_id, lower(name)) index", in: { migration: good.replace(/CREATE UNIQUE INDEX[\s\S]*?lower\(name\)\);\n\n/, "") }, wantMin: 1 },
  ];

  let failed = 0;
  for (const c of cases) {
    const n = assertGuard(c.in).length;
    const ok = c.want !== undefined ? n === c.want : n >= c.wantMin;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.name}  (errors=${n})`);
  }
  if (failed) { console.error(`\n${LABEL} SELFTEST FAILED: ${failed}`); process.exit(1); }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) { selftest(); process.exit(0); }

const migration = read(MIGRATION);
if (migration == null) {
  console.error(`[${LABEL}] FAILED — missing ${MIGRATION}`);
  process.exit(1);
}
const errors = assertGuard({ migration });
if (errors.length) {
  console.error(`[${LABEL}] FAILED — ${errors.length} issue(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — ${TABLE} is entity-scoped, FORCE RLS, SELECT/INSERT/UPDATE-only grants, EXISTS-guarded seed, UNIQUE (operating_company_id, lower(name)).`);
