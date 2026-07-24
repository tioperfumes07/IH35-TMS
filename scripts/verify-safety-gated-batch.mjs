#!/usr/bin/env node
/**
 * GUARD: the safety gated batch — F29 join tables, incident void, F34 ask-rail, Clearinghouse
 * query_type, F09 escrow target. (Owner work order 2026-07-24.)
 *
 * WHY THIS EXISTS — one line per item, because each is a different way to be quietly wrong:
 *
 * F29  A jsonb array of ids is not a link: no FK, no cascade, no reverse query, and it can name a
 *      deleted or wrong row while nothing notices. The jsonb columns stay (additive-only) but must
 *      never again be the write or read path.
 * VOID safety.incidents had no void columns at all, so an incident filed in error could only be
 *      "closed" — a lifecycle outcome, not a retraction. void-not-delete, reason required.
 * F34  OWNER RULING: ALWAYS ASK. `recovery_rail` defaults to 'ask' and NOTHING posts on 'ask'. No
 *      dollar threshold may exist — an invented threshold is a known failure class (PR #3231).
 *      This batch is SCHEMA ONLY: no GL, no posting, no flag flip.
 * CH   §382.701 distinguishes the pre-employment FULL query from the ANNUAL LIMITED one. Without
 *      query_type the annual cadence cannot be tracked and an auditor cannot be shown compliance.
 * F09  `ESCROW_TARGET_DEFAULT = 1000` was invented in the client and drove accumulation math on
 *      real money; prod has no escrow config it could have been standing in for. Owner decision:
 *      $2,500 = 250000 cents, per entity, configurable. And `has_signed_clause` — which gates
 *      forfeiting a driver's money — must read a real signed contract, not infer from the existence
 *      of a timeline bucket.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG_A = "db/migrations/202607820000_safety_relational_linkage_and_lifecycle.sql";
const MIG_B = "db/migrations/202607830000_escrow_target_settings.sql";
const CV_ROUTES = "apps/backend/src/safety/company-violations.routes.ts";
const INC_ROUTES = "apps/backend/src/safety/incidents.routes.ts";
const CH_ROUTES = "apps/backend/src/safety/drug-program.routes.ts";
const ESCROW_SVC = "apps/backend/src/driver-finance/escrow-target.service.ts";
const FE_ESCROW = "apps/frontend/src/api/driverFinance.ts";
const FILES = [MIG_A, MIG_B, CV_ROUTES, INC_ROUTES, CH_ROUTES, ESCROW_SVC, FE_ESCROW];
const LABEL = "verify-safety-gated-batch";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripTsComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

export function assertGatedBatch(sources) {
  const raw = {};
  for (const rel of FILES) raw[rel] = sources?.[rel] ?? read(rel);
  const code = Object.fromEntries(
    [CV_ROUTES, INC_ROUTES, CH_ROUTES, ESCROW_SVC, FE_ESCROW].map((r) => [r, stripTsComments(raw[r])])
  );
  const problems = [];

  // --- migrations are HELD and additive ---
  for (const mig of [MIG_A, MIG_B]) {
    if (!/DO NOT RUN ON PROD/.test(raw[mig])) {
      problems.push(`${mig}: missing the DO-NOT-RUN-ON-PROD marker — verify-hold-migrations-registered relies on it to keep db:migrate from firing this on prod.`);
    }
    if (/\bDROP\s+(TABLE|COLUMN)\b/i.test(raw[mig].replace(/^--.*$/gm, ""))) {
      problems.push(`${mig}: contains a DROP outside comments — this batch is additive-only.`);
    }
  }
  // F29 tables + FORCED RLS + 0-orphan abort
  for (const t of ["company_violation_drivers", "company_violation_units", "company_violation_fines"]) {
    if (!raw[MIG_A].includes(`safety.${t}`)) problems.push(`${MIG_A}: missing join table ${t}.`);
  }
  if (!/FORCE ROW LEVEL SECURITY/.test(raw[MIG_A])) {
    problems.push(`${MIG_A}: join tables are not FORCE ROW LEVEL SECURITY — entity isolation would depend on the caller remembering to filter.`);
  }
  if (!/RAISE EXCEPTION[\s\S]{0,200}backfill ABORTED/.test(raw[MIG_A])) {
    problems.push(`${MIG_A}: the jsonb backfill has no 0-orphan ABORT — an unresolvable id would be silently dropped, turning a data problem into data loss.`);
  }
  if (/GRANT[^;]*DELETE[^;]*safety\.company_violation/i.test(raw[MIG_A])) {
    problems.push(`${MIG_A}: a DELETE grant was issued on a join table — these are retired via is_active, never deleted.`);
  }
  // F34 ask-rail
  if (!/recovery_rail\s+text NOT NULL DEFAULT 'ask'/.test(raw[MIG_A])) {
    problems.push(`${MIG_A}: recovery_rail is missing or does not default to 'ask' — the owner ruling is ALWAYS ASK, never a silent classification.`);
  }
  // The banned thing is a NUMERIC threshold gating the rail, not the word. My first version of this
  // assertion matched /threshold/ and flagged my own COMMENT ON COLUMN — which documents that no
  // threshold exists. A guard that fires on documentation of the rule it enforces is noise.
  const migAExecutable = raw[MIG_A].replace(/^--.*$/gm, "").replace(/'(?:[^']|'')*'/g, "''");
  if (/damage_amount_cents\s*[<>]=?\s*\d/.test(migAExecutable)) {
    problems.push(`${MIG_A}: damage_amount_cents is compared against a literal — that is a dollar threshold gating the ask-rail, which the owner ruled out (PR #3231 failure class).`);
  }
  // Clearinghouse
  if (!/query_type\s+text NOT NULL DEFAULT 'annual_limited'/.test(raw[MIG_A])) {
    problems.push(`${MIG_A}: clearinghouse query_type missing — §382.701 annual cadence cannot be tracked without it.`);
  }
  // F09 seed
  if (!/250000/.test(raw[MIG_B]) || !/escrow_settings/.test(raw[MIG_B])) {
    problems.push(`${MIG_B}: the per-entity escrow target store or its 250000-cent seed is missing (owner decision: $2,500).`);
  }

  // --- code cut over ---
  if (/JSON\.stringify\(body\.data\.related_(drivers|units|fine_ids)/.test(code[CV_ROUTES])) {
    problems.push(`${CV_ROUTES}: still WRITES the retired jsonb columns — the join tables would be bypassed on create.`);
  }
  for (const t of ["company_violation_drivers", "company_violation_units", "company_violation_fines"]) {
    if (!code[CV_ROUTES].includes(t)) {
      problems.push(`${CV_ROUTES}: never references ${t} — the migration would ship tables nothing reads or writes.`);
    }
  }
  if (!/voided_at = now\(\)/.test(code[INC_ROUTES]) || !/voided_reason/.test(code[INC_ROUTES])) {
    problems.push(`${INC_ROUTES}: no void route setting voided_at + voided_reason (void-not-delete).`);
  }
  if (/DELETE\s+FROM\s+safety\.incidents/i.test(code[INC_ROUTES])) {
    problems.push(`${INC_ROUTES}: incidents are DELETEd somewhere — void-not-delete forbids it.`);
  }
  if (!/query_type/.test(code[CH_ROUTES])) {
    problems.push(`${CH_ROUTES}: query_type is not persisted on create — the column would ship unused.`);
  }
  // F09 code
  if (/ESCROW_TARGET_DEFAULT\s*=\s*\d/.test(code[FE_ESCROW])) {
    problems.push(`${FE_ESCROW}: the hardcoded escrow target constant is back — it drove accumulation math on real money.`);
  }
  if (!/getDriverEscrowTarget/.test(code[FE_ESCROW])) {
    problems.push(`${FE_ESCROW}: does not resolve the escrow target from the server.`);
  }
  if (!/legal\.contract_instances/.test(code[ESCROW_SVC]) || !/signed_electronically/.test(code[ESCROW_SVC])) {
    problems.push(`${ESCROW_SVC}: has_signed_clause does not read a real signed contract — inferring it from a data side-effect gates the forfeiture of a driver's money.`);
  }
  if (!/targetCents == null/.test(code[ESCROW_SVC])) {
    problems.push(`${ESCROW_SVC}: no null-target path — an unknown target must stay unknown, never fall back to a constant.`);
  }

  return problems;
}

if (SELFTEST) {
  const live = Object.fromEntries(FILES.map((rel) => [rel, read(rel)]));
  const failures = [];
  const expectCaught = (name, mutated, needle) => {
    if (JSON.stringify(mutated) === JSON.stringify(live)) {
      failures.push(`${name}: inert mutation — the guard was never actually exercised`);
      return;
    }
    const problems = assertGatedBatch(mutated);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (expected "${needle}", got: ${problems.join(" | ") || "none"})`);
    }
  };

  expectCaught("orphan-abort-removed",
    { ...live, [MIG_A]: live[MIG_A].replace(/RAISE EXCEPTION/, "RAISE NOTICE") }, "no 0-orphan ABORT");
  expectCaught("forced-rls-dropped",
    { ...live, [MIG_A]: live[MIG_A].split("FORCE ROW LEVEL SECURITY").join("ENABLE ROW LEVEL SECURITY") },
    "not FORCE ROW LEVEL SECURITY");
  expectCaught("ask-rail-gets-a-real-default",
    { ...live, [MIG_A]: live[MIG_A].replace("recovery_rail                text NOT NULL DEFAULT 'ask'", "recovery_rail                text NOT NULL DEFAULT 'expense'") },
    "does not default to 'ask'");
  expectCaught("dollar-threshold-sneaks-in",
    { ...live, [MIG_A]: live[MIG_A].replace("CHECK (recovery_rail IN (", "CHECK (damage_amount_cents > 100000 AND recovery_rail IN (") },
    "that is a dollar threshold gating the ask-rail");
  expectCaught("seed-changed",
    { ...live, [MIG_B]: live[MIG_B].split("250000").join("100000") }, "250000-cent seed is missing");
  expectCaught("jsonb-write-returns",
    { ...live, [CV_ROUTES]: live[CV_ROUTES].replace("body.data.source_doc_id ?? null,", "JSON.stringify(body.data.related_drivers ?? null),\n          body.data.source_doc_id ?? null,") },
    "still WRITES the retired jsonb columns");
  expectCaught("hardcoded-target-returns",
    { ...live, [FE_ESCROW]: live[FE_ESCROW] + "\nconst ESCROW_TARGET_DEFAULT = 1000;\n" },
    "hardcoded escrow target constant is back");
  expectCaught("signed-clause-inferred-again",
    { ...live, [ESCROW_SVC]: live[ESCROW_SVC].split("legal.contract_instances").join("some.other_table") },
    "does not read a real signed contract");

  const liveProblems = assertGatedBatch(live);
  if (liveProblems.length) failures.push(`live sources FAIL (false positive): ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 8 planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertGatedBatch();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — join tables (FORCED RLS + 0-orphan abort) replace the jsonb, incident void is void-not-delete, ask-rail defaults to 'ask', clearinghouse query_type persists, escrow target resolves from config`);
