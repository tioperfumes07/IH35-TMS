#!/usr/bin/env node
/**
 * LST-WIRE-07-CUSTOMER-TYPES-CATALOG-NO-CONSUMER (seed half) — catalogs.customer_types had the
 * correct schema on prod but zero seeded rows (live-verified via Neon MCP, 2026-08-20), because
 * the original seed migration's dynamic org.companies join apparently ran before all 3 companies
 * existed and never re-ran. This guard locks the backfill migration's shape: idempotent
 * (ON CONFLICT DO NOTHING), dynamic over org.companies (never a hardcoded company UUID — the exact
 * class of bug that caused the original gap), and targets catalogs.customer_types.
 *
 * FAIL: the migration is missing, not idempotent, or contains a literal UUID instead of a dynamic
 * SELECT from org.companies.
 * PASS: all hold.
 *
 * Self-test: node scripts/verify-customer-types-seed-backfill.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-customer-types-seed-backfill";
const FILE = "db/migrations/202612820100_customer_types_seed_backfill.sql";
const UUID_LITERAL_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function failures(sql) {
  const out = [];
  if (sql === undefined) {
    out.push(`${FILE}: missing`);
    return out;
  }
  // Scope every check to the real SQL only — strip `--` line comments first, so prose in the
  // header (which explains ON CONFLICT / org.companies / deactivated_at in English) can never
  // make a mutation-that-removes-the-real-clause look like it still passes.
  const code = sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
  if (!/INSERT INTO catalogs\.customer_types/.test(code)) out.push(`${FILE}: does not insert into catalogs.customer_types`);
  if (!/ON CONFLICT\s*\([^)]*\)\s*DO NOTHING/.test(code)) out.push(`${FILE}: not idempotent — missing ON CONFLICT (...) DO NOTHING`);
  if (!/FROM org\.companies/.test(code)) out.push(`${FILE}: not dynamic — missing FROM org.companies`);
  if (UUID_LITERAL_RE.test(code)) out.push(`${FILE}: contains a hardcoded UUID literal — exactly the class of bug this migration fixes`);
  if (!/WHERE c\.deactivated_at IS NULL/.test(code)) out.push(`${FILE}: missing active-company filter (deactivated_at IS NULL)`);
  return out;
}

const filePath = path.join(ROOT, FILE);
const live = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : undefined;

if (process.argv.includes("--selftest")) {
  if (live === undefined) {
    console.error(`${LABEL} SELFTEST FAIL — cannot self-test, ${FILE} does not exist`);
    process.exit(1);
  }
  const mutations = [
    { name: "ON CONFLICT removed", mutate: (t) => t.replace(/ON CONFLICT \(operating_company_id, code\) DO NOTHING;/, ";") },
    {
      name: "dynamic company join replaced with hardcoded UUID",
      // Anchor on "org.companies c\n  CROSS JOIN" — unique to the real code line, unlike the
      // header comment's own prose mention of "FROM org.companies c" in a different sentence.
      mutate: (t) => t.replace("FROM org.companies c\n  CROSS JOIN", "FROM (SELECT '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid AS id) c\n  CROSS JOIN"),
    },
    { name: "active-company filter removed", mutate: (t) => t.replace("WHERE c.deactivated_at IS NULL\n", "") },
  ];
  const escaped = [];
  for (const { name, mutate } of mutations) {
    const mutated = mutate(live);
    if (mutated === live) {
      escaped.push(`${name}: mutation anchor missing`);
      continue;
    }
    if (failures(mutated).length === 0) escaped.push(`${name}: planted defect escaped`);
  }
  if (escaped.length) {
    console.error(`${LABEL} SELFTEST FAIL\n${escaped.join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

const missing = failures(live);
if (missing.length) {
  console.error(`${LABEL} FAIL\n${missing.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — seed backfill migration is idempotent, dynamic over org.companies, no hardcoded UUID`);
