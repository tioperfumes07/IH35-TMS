#!/usr/bin/env node
/**
 * Driver payment-method master-data guard (canonical driver_finance.driver_payment_methods, migration
 * 202607350000). Locks the invariants so they can't regress:
 *   (1) TABLE: driver_finance.driver_payment_methods created with FORCE ROW LEVEL SECURITY, an
 *       operating_company_id tenant policy (current_setting('app.operating_company_id')), and grants to
 *       ih35_app that DO NOT include DELETE (void-not-delete via is_active/voided_at).
 *   (2) FLAG DEFAULT OFF: the migration seeds DRIVER_PAYMENT_METHODS_ENABLED with default_enabled = false.
 *   (3) PER-ENTITY-ONLY: the flag is in PER_ENTITY_ONLY_FLAG_KEYS (can't be turned on globally).
 *   (4) DEFECT FIXED: settlement-payment.service.ts no longer probes the phantom mdata.drivers token
 *       columns (bank_account_token / ach_bank_account_token / direct_deposit_token) and instead resolves
 *       ACH config via resolveDefaultAchToken (the canonical store).
 *   (5) EXPAND/CONTRACT: resolveDefaultAchToken is flag-gated AND to_regclass-guarded, so a code-first
 *       deploy (before the HELD migration) can't 500 and an OFF entity keeps prior behavior.
 *
 * --selftest exercises the assertions against inline fixtures (pass + each failure mode).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-payment-method-tenant-scope";
const MIGRATION = "db/migrations/202607350000_driver_payment_methods.sql";
const SETTLEMENT_PAY = "apps/backend/src/driver-finance/settlement-payment.service.ts";
const PM_SERVICE = "apps/backend/src/driver-finance/driver-payment-methods.service.ts";
const FLAG_SERVICE = "apps/backend/src/lib/feature-flags/service.ts";
const KEY = "DRIVER_PAYMENT_METHODS_ENABLED";

export function assertGuard({ migration, settlementPay, pmService, flagService }) {
  const errors = [];

  // (1) table + FORCE RLS + tenant policy + grants without DELETE
  if (!/CREATE TABLE IF NOT EXISTS\s+driver_finance\.driver_payment_methods/.test(migration)) {
    errors.push(`${MIGRATION}: driver_finance.driver_payment_methods table not created (idempotent)`);
  }
  if (!/FORCE ROW LEVEL SECURITY/.test(migration)) {
    errors.push(`${MIGRATION}: table must FORCE ROW LEVEL SECURITY`);
  }
  if (!/current_setting\('app\.operating_company_id'/.test(migration)) {
    errors.push(`${MIGRATION}: tenant policy must scope on current_setting('app.operating_company_id')`);
  }
  const grant = /GRANT\s+([A-Z,\s]+?)\s+ON\s+driver_finance\.driver_payment_methods\s+TO\s+ih35_app/.exec(migration);
  if (!grant) {
    errors.push(`${MIGRATION}: missing GRANT ... ON driver_finance.driver_payment_methods TO ih35_app`);
  } else if (/\bDELETE\b/.test(grant[1])) {
    errors.push(`${MIGRATION}: grants must NOT include DELETE (void-not-delete)`);
  }

  // (2) flag seeded default OFF
  if (!new RegExp(`'${KEY}'[\\s\\S]{0,600}?,\\s*false\\s*,`).test(migration)) {
    errors.push(`${MIGRATION}: ${KEY} must be seeded with default_enabled = false`);
  }

  // (3) per-entity-only
  const perEntity = /PER_ENTITY_ONLY_FLAG_KEYS[\s\S]*?\]\)/.exec(flagService);
  if (!perEntity || !perEntity[0].includes(KEY)) {
    errors.push(`${FLAG_SERVICE}: ${KEY} must be in PER_ENTITY_ONLY_FLAG_KEYS (per-entity-only, no global enable)`);
  }

  // (4) defect fixed — no phantom-column probe left, resolves via canonical store
  if (/bank_account_token|ach_bank_account_token|direct_deposit_token/.test(settlementPay)) {
    errors.push(`${SETTLEMENT_PAY}: still references the phantom mdata.drivers token columns (defect)`);
  }
  if (!/resolveDefaultAchToken/.test(settlementPay)) {
    errors.push(`${SETTLEMENT_PAY}: must resolve ACH config via resolveDefaultAchToken (canonical store)`);
  }

  // (5) expand/contract: flag-gated AND to_regclass-guarded
  if (!new RegExp(`isEnabled\\([\\s\\S]{0,120}?(${KEY}|PAYMENT_METHODS_FLAG_KEY)`).test(pmService)) {
    errors.push(`${PM_SERVICE}: resolveDefaultAchToken must gate on isEnabled(${KEY})`);
  }
  if (!/to_regclass\('driver_finance\.driver_payment_methods'\)/.test(pmService)) {
    errors.push(`${PM_SERVICE}: resolveDefaultAchToken must to_regclass-guard the HELD table (expand/contract)`);
  }

  return errors;
}

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

function selftest() {
  const good = {
    migration:
      `CREATE TABLE IF NOT EXISTS driver_finance.driver_payment_methods ( id uuid );\n` +
      `ALTER TABLE driver_finance.driver_payment_methods FORCE ROW LEVEL SECURITY;\n` +
      `CREATE POLICY p ON driver_finance.driver_payment_methods FOR ALL TO ih35_app USING ( operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid );\n` +
      `GRANT SELECT, INSERT, UPDATE ON driver_finance.driver_payment_methods TO ih35_app;\n` +
      `INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct) VALUES ('${KEY}', 'x', false, 0) ON CONFLICT DO NOTHING;`,
    settlementPay: `const token = await resolveDefaultAchToken(client, operatingCompanyId, driverId);`,
    pmService:
      `const enabled = await isEnabled(client, PAYMENT_METHODS_FLAG_KEY, { operating_company_id: operatingCompanyId });\n` +
      `const reg = await client.query("SELECT to_regclass('driver_finance.driver_payment_methods')::text AS t");`,
    flagService: `export const PER_ENTITY_ONLY_FLAG_KEYS = new Set(["${KEY}", "RATECON_EXTRACT_ENABLED"])`,
  };
  const cases = [
    { name: "well-formed → 0 errors", in: good, want: 0 },
    { name: "no FORCE RLS", in: { ...good, migration: good.migration.replace("FORCE ROW LEVEL SECURITY", "ROW LEVEL SECURITY") }, wantMin: 1 },
    { name: "grants DELETE", in: { ...good, migration: good.migration.replace("SELECT, INSERT, UPDATE", "SELECT, INSERT, UPDATE, DELETE") }, wantMin: 1 },
    { name: "flag default true", in: { ...good, migration: good.migration.replace(", false, 0", ", true, 0") }, wantMin: 1 },
    { name: "not per-entity-only", in: { ...good, flagService: `export const PER_ENTITY_ONLY_FLAG_KEYS = new Set(["RATECON_EXTRACT_ENABLED"])` }, wantMin: 1 },
    { name: "phantom probe remains", in: { ...good, settlementPay: `information_schema ... 'ach_bank_account_token'` }, wantMin: 1 },
    { name: "no flag gate in resolver", in: { ...good, pmService: `const reg = await client.query("SELECT to_regclass('driver_finance.driver_payment_methods')::text AS t");` }, wantMin: 1 },
    { name: "no to_regclass guard", in: { ...good, pmService: `const enabled = await isEnabled(client, PAYMENT_METHODS_FLAG_KEY, {});` }, wantMin: 1 },
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

const inputs = {
  migration: read(MIGRATION),
  settlementPay: read(SETTLEMENT_PAY),
  pmService: read(PM_SERVICE),
  flagService: read(FLAG_SERVICE),
};
for (const [k, v] of Object.entries(inputs)) {
  if (v == null) { console.error(`[${LABEL}] FAILED — missing file for ${k}`); process.exit(1); }
}
const errors = assertGuard(inputs);
if (errors.length) {
  console.error(`[${LABEL}] FAILED — ${errors.length} issue(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — driver_finance.driver_payment_methods is tenant-scoped/void-not-delete, flag per-entity default OFF, phantom-column defect fixed, expand/contract-safe.`);
