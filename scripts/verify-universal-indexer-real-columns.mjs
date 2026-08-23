#!/usr/bin/env node
/**
 * SRCH-F64 — the universal search indexer must select columns that EXIST, and must never index a
 * government identifier.
 *
 * WHY THIS EXISTS (verified on prod br-fancy-credit-akjnd07a, 2026-08-01):
 * search/universal/indexer.service.ts selected `COALESCE(d.driver_code, '')` from mdata.drivers.
 * There is no driver_code column — the real display identifier is employee_id_display. The statement
 * therefore failed at PARSE time and `_system.background_jobs` showed search.indexer_incremental with
 * last_successful_run_at = NULL: universal search has NEVER indexed a driver. 90 active drivers
 * (181 rows total; deactivated retained under void-not-delete) were unsearchable.
 *
 * THE SECOND ASSERTION IS THE ONE THAT MATTERS LONGER-TERM. mdata.drivers really does carry
 * cdl_number, visa_number, passport_number, ine_number, b1_visa_number, mexican_license_number,
 * fast_card_number and twic_card_number. Any of those would have "fixed" the parse error just as
 * well, and the obvious guess when someone sees a missing driver_code is to reach for cdl_number.
 * That would publish government ID numbers into an index every authorised user can query, and the
 * drivers here are Mexican B1 contractors whose visa and passport numbers are exactly the data that
 * must not spread. This guard fails on any of them.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SVC = "apps/backend/src/search/universal/indexer.service.ts";
const JOB = "apps/backend/src/jobs/search-indexer-incremental.ts";
const MIGRATION = "db/migrations/202613130000_srch_f6231_company_scoped_universal_index_shared_drivers.sql";
const LABEL = "verify-universal-indexer-real-columns";

/** Columns that do NOT exist on mdata.drivers (prod-verified) — selecting one is a parse-time failure. */
const PHANTOM_DRIVER_COLUMNS = ["driver_code", "full_name", "driver_number", "employee_code"];

/** Real columns that must never reach a universal search index. */
const SENSITIVE_DRIVER_COLUMNS = [
  "cdl_number",
  "visa_number",
  "passport_number",
  "ine_number",
  "b1_visa_number",
  "mexican_license_number",
  "fast_card_number",
  "twic_card_number",
];

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/--[^\n]*/g, "");
}

export function auditIndexer(src) {
  const code = stripComments(src);
  const problems = [];
  for (const col of PHANTOM_DRIVER_COLUMNS) {
    if (new RegExp(`\\bd?\\.?${col}\\b`).test(code)) {
      problems.push(
        `${SVC}: selects mdata.drivers.${col}, which does not exist on prod. The statement fails at ` +
          `PARSE time, so the indexer never runs and universal search silently indexes nothing.`
      );
    }
  }
  for (const col of SENSITIVE_DRIVER_COLUMNS) {
    if (new RegExp(`\\b${col}\\b`).test(code)) {
      problems.push(
        `${SVC}: indexes mdata.drivers.${col}. Government identifiers must never enter the universal ` +
          `search index — these drivers are Mexican B1 contractors and their visa/passport/CDL numbers ` +
          `are precisely the data that must not spread. Use employee_id_display.`
      );
    }
  }
  return problems;
}

function requirePattern(problems, src, pattern, message) {
  if (!pattern.test(stripComments(src))) problems.push(message);
}

export function auditCompanyScope({ indexer, job, migration }) {
  const problems = [];
  requirePattern(
    problems,
    migration,
    /UNIQUE\s*\(\s*operating_company_id\s*,\s*entity_type\s*,\s*entity_uuid\s*\)/i,
    `${MIGRATION}: universal-search identity must include operating_company_id so one shared driver can be indexed for multiple companies.`
  );
  requirePattern(
    problems,
    indexer,
    /ON\s+CONFLICT\s*\(\s*operating_company_id\s*,\s*entity_type\s*,\s*entity_uuid\s*\)/i,
    `${SVC}: upsert conflict identity must be company-scoped.`
  );
  requirePattern(
    problems,
    indexer,
    /d\.operating_company_id\s*=\s*\$1::uuid\s+OR\s+EXISTS\s*\([\s\S]*?driver_company_authorizations\s+universal_driver_dca[\s\S]*?universal_driver_dca\.driver_id\s*=\s*d\.id[\s\S]*?universal_driver_dca\.company_id\s*=\s*\$1::uuid[\s\S]*?universal_driver_dca\.is_authorized\s*=\s*true[\s\S]*?universal_driver_dca\.deactivated_at\s+IS\s+NULL/i,
    `${SVC}: driver indexing must include active company-authorized shared drivers as well as home-company drivers.`
  );
  requirePattern(
    problems,
    indexer,
    /DELETE\s+FROM\s+search\.universal_index\s+ui[\s\S]*?ui\.operating_company_id\s*=\s*\$1::uuid[\s\S]*?ui\.entity_type\s*=\s*'driver'[\s\S]*?driver_company_authorizations\s+universal_driver_cleanup_dca[\s\S]*?universal_driver_cleanup_dca\.is_authorized\s*=\s*true[\s\S]*?universal_driver_cleanup_dca\.deactivated_at\s+IS\s+NULL/i,
    `${SVC}: the derived driver index must prune selected-company rows after authorization or active status is revoked.`
  );
  for (const [pattern, source] of [
    [/FROM\s+mdata\.loads/i, "loads"],
    [/FROM\s+mdata\.drivers[\s\S]*?deactivated_at\s+IS\s+NULL/i, "active driver home companies"],
    [/FROM\s+mdata\.driver_company_authorizations[\s\S]*?is_authorized\s*=\s*true[\s\S]*?deactivated_at\s+IS\s+NULL/i, "active driver authorization companies"],
  ]) {
    requirePattern(problems, job, pattern, `${JOB}: incremental company discovery must include ${source}.`);
  }
  return problems;
}

function auditTree() {
  const indexer = readFileSync(join(ROOT, SVC), "utf8");
  const job = readFileSync(join(ROOT, JOB), "utf8");
  const migration = readFileSync(join(ROOT, MIGRATION), "utf8");
  return [...auditIndexer(indexer), ...auditCompanyScope({ indexer, job, migration })];
}

function selftest() {
  const failures = [];
  if (auditIndexer("COALESCE(d.driver_code, '') AS secondary_text").length === 0)
    failures.push("case1 FAIL — the phantom driver_code was NOT caught");
  if (auditIndexer("COALESCE(d.employee_id_display, '') AS secondary_text").length !== 0)
    failures.push("case2 FAIL — the correct employee_id_display was flagged");
  if (!auditIndexer("COALESCE(d.cdl_number, '') AS secondary_text").some((p) => p.includes("Government identifiers")))
    failures.push("case3 FAIL — indexing cdl_number was NOT caught");
  if (!auditIndexer("COALESCE(d.passport_number, '') AS secondary_text").some((p) => p.includes("Government identifiers")))
    failures.push("case4 FAIL — indexing passport_number was NOT caught");
  const tree = auditTree();
  if (tree.length !== 0) failures.push(`case5 FAIL — real source flagged: ${tree.join(" | ")}`);
  const realIndexer = readFileSync(join(ROOT, SVC), "utf8");
  const realJob = readFileSync(join(ROOT, JOB), "utf8");
  const realMigration = readFileSync(join(ROOT, MIGRATION), "utf8");
  const cases = [
    ["case6", { indexer: realIndexer, job: realJob, migration: realMigration.replace("operating_company_id, entity_type, entity_uuid", "entity_type, entity_uuid") }],
    ["case7", { indexer: realIndexer.replace("ON CONFLICT (operating_company_id, entity_type, entity_uuid)", "ON CONFLICT (entity_type, entity_uuid)"), job: realJob, migration: realMigration }],
    ["case8", { indexer: realIndexer.replace("universal_driver_dca.is_authorized = true", "universal_driver_dca.is_authorized = false"), job: realJob, migration: realMigration }],
    ["case9", { indexer: realIndexer.replace("DELETE FROM search.universal_index ui", "SELECT * FROM search.universal_index ui"), job: realJob, migration: realMigration }],
    ["case10", { indexer: realIndexer, job: realJob.replace("FROM mdata.loads", "FROM mdata.not_loads"), migration: realMigration }],
    ["case11", { indexer: realIndexer, job: realJob.replace("FROM mdata.drivers", "FROM mdata.not_drivers"), migration: realMigration }],
    ["case12", { indexer: realIndexer, job: realJob.replace("FROM mdata.driver_company_authorizations", "FROM mdata.not_driver_company_authorizations"), migration: realMigration }],
  ];
  for (const [name, fixture] of cases) {
    if (auditCompanyScope(fixture).length === 0) failures.push(`${name} FAIL — planted company-scope defect was NOT caught`);
  }
  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — 12/12 planted column, privacy, company-scope, eligibility, cleanup, and discovery defects caught`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — real/private-safe columns, company-scoped identity, shared-driver eligibility, cleanup, and company discovery are ratcheted`);
}

main();
