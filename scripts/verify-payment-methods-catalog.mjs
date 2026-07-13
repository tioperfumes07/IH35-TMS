#!/usr/bin/env node
/**
 * Payment-methods CATALOG guard (Settlement Pay-Run — migration 202607380000).
 *
 * CANONICAL-CHECK: catalogs.payment_methods is the ONE canonical payment-method catalog, CREATED by 0152
 * (Lists-Hub) as a code-keyed table (UNIQUE(operating_company_id, code), display_name, grants incl DELETE,
 * ENABLE RLS `company_scope`). The Settlement Pay-Run migration must REUSE-AND-EXTEND it — never re-create
 * it and never stand up a parallel key. An earlier CREATE TABLE IF NOT EXISTS with a `name` column NO-OP'd
 * against the existing code-based table and the seed failed `column "name" does not exist` — the split-brain
 * this guard now forbids. Locks:
 *   (1) REUSE: NO `CREATE TABLE ... catalogs.payment_methods`; the migration ALTERs it to ADD gl_account_id
 *       (uuid REFERENCES catalogs.accounts) — extend, not re-create.
 *   (2) GL SAME-ENTITY: a BEFORE INSERT/UPDATE trigger asserts gl_account_id's account is in the same
 *       operating_company (no cross-entity GL pointer).
 *   (3) DELETE GRANT PRESERVED: the migration does NOT REVOKE DELETE on the table (0152's Lists-Hub DELETE
 *       grant stays; void-not-delete is enforced in the service, not by yanking the grant).
 *   (4) SEED ON THE CANONICAL KEY: INSERT ... FROM org.companies CROSS JOIN (VALUES ...) ON CONFLICT
 *       (operating_company_id, code) DO NOTHING — extends by `code` (never lower(name)); a fresh CI DB
 *       (0 companies) seeds 0 rows.
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

  // (1) REUSE, not re-create — 0152 owns the canonical table.
  if (/CREATE TABLE[^;]*\bcatalogs\.payment_methods\b/i.test(migration)) {
    errors.push(`${MIGRATION}: must NOT CREATE ${TABLE} — 0152 already created it; REUSE-AND-EXTEND (ALTER) only`);
  }
  if (!/ALTER TABLE\s+catalogs\.payment_methods[\s\S]{0,400}?ADD COLUMN IF NOT EXISTS\s+gl_account_id\s+uuid[\s\S]{0,80}?REFERENCES\s+catalogs\.accounts/i.test(migration)) {
    errors.push(`${MIGRATION}: must ALTER ${TABLE} ADD COLUMN IF NOT EXISTS gl_account_id uuid REFERENCES catalogs.accounts(id)`);
  }

  // (2) GL account must be same-entity (trigger).
  if (!/assert_payment_method_gl_same_entity/.test(migration) ||
      !/BEFORE INSERT OR UPDATE ON\s+catalogs\.payment_methods/i.test(migration)) {
    errors.push(`${MIGRATION}: missing same-entity GL trigger (assert_payment_method_gl_same_entity BEFORE INSERT OR UPDATE)`);
  }

  // (3) DELETE grant preserved — the migration must not REVOKE DELETE (0152's Lists-Hub grant stays).
  if (/REVOKE[\s\S]{0,60}?\bDELETE\b[\s\S]{0,60}?catalogs\.payment_methods/i.test(migration)) {
    errors.push(`${MIGRATION}: must NOT REVOKE DELETE on ${TABLE} (leave 0152's Lists-Hub DELETE grant; void-not-delete lives in the service)`);
  }

  // (4) seed extends by the canonical key `code`, EXISTS-guarded via CROSS JOIN org.companies.
  if (!/INSERT INTO\s+catalogs\.payment_methods[\s\S]{0,600}?FROM\s+org\.companies[\s\S]{0,300}?CROSS JOIN/i.test(migration)) {
    errors.push(`${MIGRATION}: seed must be INSERT ... FROM org.companies ... CROSS JOIN (VALUES ...) so a fresh CI DB (0 companies) seeds 0 rows`);
  }
  if (!/ON CONFLICT\s*\(\s*operating_company_id\s*,\s*code\s*\)\s*DO NOTHING/i.test(migration)) {
    errors.push(`${MIGRATION}: seed must ON CONFLICT (operating_company_id, code) DO NOTHING — extend by the canonical key, never a parallel lower(name) key`);
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
-- CANONICAL-CHECK: reuse-and-extend the 0152 catalogs.payment_methods (code-keyed). Do NOT re-create.
ALTER TABLE catalogs.payment_methods
  ADD COLUMN IF NOT EXISTS gl_account_id uuid NULL REFERENCES catalogs.accounts(id),
  ADD COLUMN IF NOT EXISTS voided_at timestamptz NULL;

CREATE OR REPLACE FUNCTION catalogs.assert_payment_method_gl_same_entity()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_payment_method_gl_same_entity ON catalogs.payment_methods;
CREATE TRIGGER trg_payment_method_gl_same_entity
  BEFORE INSERT OR UPDATE ON catalogs.payment_methods
  FOR EACH ROW EXECUTE FUNCTION catalogs.assert_payment_method_gl_same_entity();

INSERT INTO catalogs.payment_methods (operating_company_id, code, display_name, sort_order)
SELECT c.id, m.code, m.display_name, m.ord
FROM org.companies c
CROSS JOIN (VALUES ('CHECK','Check',40), ('CASH','Cash',50)) AS m(code, display_name, ord)
ON CONFLICT (operating_company_id, code) DO NOTHING;
`;

  const cases = [
    { name: "well-formed reuse-extend → 0 errors", in: { migration: good }, want: 0 },
    { name: "re-creates the canonical table → error", in: { migration: good + "\nCREATE TABLE IF NOT EXISTS catalogs.payment_methods (id uuid);" }, wantMin: 1 },
    { name: "no gl_account_id ALTER → error", in: { migration: good.replace(/ADD COLUMN IF NOT EXISTS gl_account_id[^,]*,/, "") }, wantMin: 1 },
    { name: "no same-entity GL trigger → error", in: { migration: good.replace(/assert_payment_method_gl_same_entity/g, "noop_fn") }, wantMin: 1 },
    { name: "REVOKEs DELETE → error", in: { migration: good + "\nREVOKE DELETE ON catalogs.payment_methods FROM ih35_app;" }, wantMin: 1 },
    { name: "seed on lower(name) not code → error", in: { migration: good.replace("ON CONFLICT (operating_company_id, code) DO NOTHING", "ON CONFLICT (operating_company_id, lower(name)) DO NOTHING") }, wantMin: 1 },
    { name: "seed not exists-guarded → error", in: { migration: good.replace(/INSERT INTO[\s\S]*DO NOTHING;/, "INSERT INTO catalogs.payment_methods (operating_company_id, code, display_name) VALUES ('11111111-1111-1111-1111-111111111111','CHECK','Check');") }, wantMin: 1 },
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
console.log(`[${LABEL}] OK — ${TABLE} is REUSED-and-extended from 0152 (code key kept, DELETE grant intact, gl_account_id same-entity, code-keyed seed).`);
