#!/usr/bin/env node
/**
 * GUARD: COMP-01 — ONE unified drug & alcohol prohibition source, read by every surface.
 *
 * WHY THIS EXISTS (2026-07-26, P0 · DOT/FMCSA exposure)
 * A driver PROHIBITED under 49 CFR Part 382 could be dispatched. Not because nobody had built a gate —
 * SAF-F07 and SAF-F07-CH had already built one — but because the answer to "is this driver prohibited?"
 * was computed in FOUR different places over FOUR different subsets of the same data:
 *
 *   apps/backend/src/dispatch/driver-qualification.service.ts  → safety.drug_test + safety.da_test_records
 *                                                                + safety.clearinghouse_query   (2 of 3 result tables)
 *   apps/backend/src/dispatch/loads.routes.ts  /drug-status     → latest safety.drug_test row + Clearinghouse
 *   apps/backend/src/safety/drug-program.routes.ts /drug-status → latest safety.drug_test row, nothing else
 *
 * THREE tables hold D&A results and all three have a registered, authenticated live write path
 * (verified against Neon PROD branch br-fancy-credit-akjnd07a on 2026-07-26 — all three tables exist,
 * all three are RLS-FORCED and granted to ih35_app):
 *
 *   safety.drug_test                      (0270) ← POST /api/v1/safety/drug-program/tests
 *   safety.da_test_records                (0327) ← safety/drug-alcohol/program.service.ts
 *   compliance.drug_alcohol_test_results  (0380) ← POST /api/v1/compliance/drug-alcohol/results
 *
 * The third was read by NOBODY in dispatch. A Part 382 positive recorded through the compliance D&A
 * module — which even auto-opens a compliance.return_to_duty_processes row, so the system positively
 * KNEW the driver was prohibited — was invisible to book-load, quick-assign, the planner and quicksave.
 * The driver was dispatchable. That is the COMP-01 defect.
 *
 * THE FIX IS UNIFICATION, NOT ANOTHER CHECK. Adding a fourth reader would have reproduced the bug in a
 * new place. driver-qualification.service.ts now owns ONE evaluator
 * (evaluateDriverDrugAlcoholStatus / fetchUnresolvedDrugAlcoholViolation) that unions all three live
 * sources plus the Clearinghouse, the gate enforces with it, and BOTH status screens display from it.
 *
 * WHAT THIS GUARD PINS (each assertion is a hole someone could reopen while "simplifying"):
 *   1. All three result tables are in the violations union — dropping any one re-opens COMP-01.
 *   2. The compliance table is in the CLEARANCES union too. Present in violations but absent from
 *      clearances would be worse than the bug: a driver who completed return-to-duty could never be
 *      un-grounded, and the office would learn to route around the gate.
 *   3. The compliance clearance arm keys on test_reason, NOT test_type. On PROD that table's test_type
 *      is drug|alcohol|combined and its RTD marker is test_reason. Using test_type there matches
 *      nothing and silently strands a cleared driver — a phantom-column bug that no type checker sees.
 *   4. The compliance arms key on driver_id (that table's column), not driver_uuid (which is
 *      safety.da_test_records' column). Copy-paste across the union is the obvious failure mode.
 *   5. `dilute` is NOT a violation. Under 49 CFR §40.197 a dilute negative is a negative; blocking on
 *      it would ground clean drivers, and a gate that cries wolf gets overridden.
 *   6. Every surface DELEGATES. No screen recomputes the verdict from one table — that local
 *      recomputation is precisely how the three readers drifted apart.
 *   7. The verdict names its source (drugAlcoholViolationSource / block_source), so a DOT reviewer
 *      asking "which record grounded this driver?" gets an answer instead of a table hunt.
 *
 * COMP-01-B — THE SECOND DEFECT, found by running the query against PROD instead of reading it.
 * safety.da_test_records.operating_company_id is TEXT on prod (pg_attribute, verified 2026-07-26) —
 * alone among the safety tables, whose column is uuid. The gate scoped it `= $2::uuid`. Postgres has
 * no `text = uuid` operator, so that arm raised 42883 "operator does not exist: text = uuid" AT PLAN
 * TIME, on every driver, with or without rows. The gate is deliberately fail-loud, so the throw
 * aborted the caller's transaction: the ENTIRE SAF-F07 D&A + Clearinghouse check never returned a
 * verdict at all. The same cast bug sat in the safety-officer home KPI, where a tableExists() probe
 * gave false reassurance — the table does exist; it is the comparison that is impossible. Nothing
 * static could have caught this: the SQL is a template literal, the types are correct TypeScript, and
 * the tables are empty so no test noticed. It took executing the real query against the real prod
 * schema. The guard now pins the cast (assertion 4b).
 *
 * Run against pre-fix origin/main (878ce913c) this FAILS with 12 problems: the gate does not mention
 * compliance.drug_alcohol_test_results at all, neither status endpoint delegates, and neither payload
 * can name its source.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GATE = "apps/backend/src/dispatch/driver-qualification.service.ts";
const DISPATCH_STATUS = "apps/backend/src/dispatch/loads.routes.ts";
const SAFETY_STATUS = "apps/backend/src/safety/drug-program.routes.ts";
const SAFETY_HOME = "apps/backend/src/safety-officer/role-views/safety-home.service.ts";
const DA_PROGRAM = "apps/backend/src/safety/drug-alcohol/program.service.ts";
const DA_RANDOM_POOL = "apps/backend/src/safety/drug-alcohol/random-pool.service.ts";
const SAFETY_LEGACY_ROUTES = "apps/backend/src/safety/safety.routes.ts";
/** Every file that scopes a safety.da_test_records read. See the COMP-01-B assertion below. */
const DA_TEST_RECORDS_READERS = [GATE, SAFETY_HOME];
const LABEL = "verify-comp01-drug-alcohol-unified-source";
const SELFTEST = process.argv.includes("--selftest");

/** The three live-written D&A result tables, verified to exist on the Neon PROD branch 2026-07-26. */
const LIVE_RESULT_TABLES = [
  ["safety.drug_test", "POST /api/v1/safety/drug-program/tests (the office UI)"],
  ["safety.da_test_records", "safety/drug-alcohol/program.service.ts (the D&A program module)"],
  ["compliance.drug_alcohol_test_results", "POST /api/v1/compliance/drug-alcohol/results (the compliance D&A module)"],
];

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripJsComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
/** SQL line comments live INSIDE template literals, so stripJsComments cannot see them. */
const stripSqlComments = (s) => s.replace(/^[ \t]*--.*$/gm, "");
const strip = (s) => stripSqlComments(stripJsComments(s));

/** The text between two markers, or "" when either marker is missing. */
function between(src, startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  if (a < 0) return "";
  const b = src.indexOf(endMarker, a + startMarker.length);
  if (b < 0) return "";
  return src.slice(a, b);
}

export function auditUnifiedDrugAlcoholSource(sources) {
  const gate = strip(sources?.[GATE] ?? read(GATE));
  const dispatchStatus = strip(sources?.[DISPATCH_STATUS] ?? read(DISPATCH_STATUS));
  const safetyStatus = strip(sources?.[SAFETY_STATUS] ?? read(SAFETY_STATUS));
  const daProgram = strip(sources?.[DA_PROGRAM] ?? read(DA_PROGRAM));
  const daRandomPool = strip(sources?.[DA_RANDOM_POOL] ?? read(DA_RANDOM_POOL));
  const safetyLegacyRoutes = strip(sources?.[SAFETY_LEGACY_ROUTES] ?? read(SAFETY_LEGACY_ROUTES));
  const problems = [];

  const legacyDrugTestList = between(
    safetyLegacyRoutes,
    'app.get("/api/v1/safety/drug-alcohol/tests"',
    'app.get(\n    "/api/v1/safety/accidents"'
  );
  if (!legacyDrugTestList) {
    problems.push(`${SAFETY_LEGACY_ROUTES}: mounted selected-company drug-test list route is missing`);
  } else if (/FROM safety\.drug_test[\s\S]*?\.catch\s*\(/.test(legacyDrugTestList)) {
    problems.push(`${SAFETY_LEGACY_ROUTES}: selected-company drug-test list query failure is converted to a false empty compliance roster`);
  }

  const violations = between(gate, "WITH violations AS", "clearances AS");
  const clearances = between(gate, "clearances AS", "SELECT v.at");

  if (!violations) {
    problems.push(
      `${GATE}: the unresolved-violation query no longer has a "WITH violations AS" CTE — the whole D&A ` +
        `prohibition read has been restructured or removed, so none of the COMP-01 assertions below can bind.`
    );
  }
  if (!clearances) {
    problems.push(
      `${GATE}: the unresolved-violation query no longer has a "clearances AS" CTE — without it every ` +
        `violation is permanent and the office will route around the gate.`
    );
  }

  // 1. All three live result tables are in the VIOLATIONS union.
  //    Matched on `FROM <table>`, deliberately: each arm also tags its rows with the table name as a
  //    string literal (the violation_source audit trail), and a bare substring test would be satisfied
  //    by that literal alone — i.e. it would still pass after the actual FROM clause was repointed at
  //    something else. The guard must bind to the read, not to the label describing it.
  const fromRe = (table) => new RegExp(`FROM\\s+${table.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\b`);
  for (const [table, writer] of LIVE_RESULT_TABLES) {
    if (violations && !fromRe(table).test(violations)) {
      problems.push(
        `${GATE}: the violations union does not read ${table} — that table is live-written by ${writer}, ` +
          `so a Part 382 positive recorded there would NOT block dispatch. This is the COMP-01 defect.`
      );
    }
  }

  // 2. The compliance table must also be in the CLEARANCES union.
  if (clearances && !fromRe("compliance.drug_alcohol_test_results").test(clearances)) {
    problems.push(
      `${GATE}: compliance.drug_alcohol_test_results is a violation source but NOT a clearance source — a ` +
        `driver who completed return-to-duty through the compliance module could never be un-grounded.`
    );
  }

  // 3. The compliance clearance arm keys on test_reason, not test_type (PROD-verified column reality).
  const complianceClearanceArm = clearances
    ? clearances.slice(clearances.indexOf("compliance.drug_alcohol_test_results"))
    : "";
  if (complianceClearanceArm && !/test_reason/.test(complianceClearanceArm)) {
    problems.push(
      `${GATE}: the compliance.drug_alcohol_test_results clearance arm does not key on test_reason. On PROD ` +
        `that table's test_type is drug|alcohol|combined and its return_to_duty marker is test_reason — ` +
        `keying on test_type matches nothing and silently strands a cleared driver.`
    );
  }

  // 4. The compliance arms key on driver_id, never on da_test_records' driver_uuid.
  for (const [name, arm] of [
    ["violations", violations],
    ["clearances", clearances],
  ]) {
    if (!arm) continue;
    const i = arm.indexOf("compliance.drug_alcohol_test_results");
    if (i < 0) continue;
    const scope = arm.slice(i, i + 400);
    if (!/driver_id\s*=/.test(scope)) {
      problems.push(
        `${GATE}: the compliance.drug_alcohol_test_results ${name} arm does not filter on driver_id — that ` +
          `table's driver column is driver_id (PROD-verified); a missing or wrong predicate would scope the ` +
          `prohibition to the wrong human.`
      );
    }
    if (/driver_uuid/.test(scope)) {
      problems.push(
        `${GATE}: the compliance.drug_alcohol_test_results ${name} arm references driver_uuid — that column ` +
          `belongs to safety.da_test_records and does NOT exist on the compliance table (PROD-verified). ` +
          `This query would throw at runtime, and a throwing gate is a fail-open gate for whoever "fixes" it ` +
          `with a try/catch.`
      );
    }
    if (!/operating_company_id\s*=/.test(scope)) {
      problems.push(
        `${GATE}: the compliance.drug_alcohol_test_results ${name} arm is not scoped by operating_company_id — ` +
          `cross-entity leak between TRANSP / TRK / USMCA.`
      );
    }
  }

  // 4b. COMP-01-B — safety.da_test_records.operating_company_id is TEXT on PROD (pg_attribute,
  //     verified 2026-07-26), unlike every sibling safety table, whose column is uuid. Postgres has
  //     no `text = uuid` operator, so `operating_company_id = $n::uuid` against THIS table throws
  //     42883 AT PLAN TIME — on every call, with or without rows. That is how the SAF-F07 D&A gate
  //     came to never return a verdict at all: it is deliberately fail-loud, so the throw aborted the
  //     caller's transaction. No type checker and no tableExists() probe can see this; only the cast
  //     can. Proven live this session: the pre-fix query errors on prod, the ::text query returns.
  //     Scoped per-arm, not per-file: these files also read sibling tables whose
  //     operating_company_id genuinely IS uuid, so a file-wide regex would flag correct code.
  for (const file of DA_TEST_RECORDS_READERS) {
    const src = strip(sources?.[file] ?? read(file));
    let from = src.indexOf("safety.da_test_records");
    if (from < 0) continue;
    while (from >= 0) {
      // The arm runs to the next FROM of another relation, or 500 chars, whichever is shorter.
      const arm = src.slice(from, from + 500).split(/\bFROM\s+(?!safety\.da_test_records)/)[0];
      if (/operating_company_id(?:::text)?\s*=\s*\$\d+::uuid(?!::text)/.test(arm)) {
        problems.push(
          `${file}: casts operating_company_id to ::uuid while reading safety.da_test_records — that ` +
            `column is TEXT on PROD, so Postgres raises "operator does not exist: text = uuid" at plan ` +
            `time and the query never runs. Use ::text.`
        );
      } else if (!/operating_company_id::text\s*=\s*\$\d+::uuid::text/.test(arm)) {
        problems.push(
          `${file}: does not normalize both safety.da_test_records.operating_company_id and the UUID ` +
            `parameter through ::text — the PROD column type is TEXT, so a UUID-only comparison kills ` +
            `the query at plan time.`
        );
      }
      from = src.indexOf("safety.da_test_records", from + 1);
    }
  }

  // 4c. The same PROD type drift affects every GAP-81 reader, not only the dispatch gate. Migration
  // 0327 declares UUID, but the live pre-existing da_* tables are TEXT for operating_company_id.
  // Every comparison against those tables must normalize both operands to text; joins to the UUID
  // mdata company key must do the same. Otherwise the program's enrollment roster, positive-result
  // queue and random-draw history all throw 42883 before they can return even an honest empty list.
  for (const [file, src, required] of [
    [DA_PROGRAM, daProgram, [
      ["e.operating_company_id::text = $1::uuid::text", 1],
      ["t.operating_company_id::text = $1::uuid::text", 1],
      ["AND operating_company_id::text = $2::uuid::text", 3],
      ["d.operating_company_id::text = e.operating_company_id::text", 1],
      ["d.operating_company_id::text = t.operating_company_id::text", 1],
    ]],
    [DA_RANDOM_POOL, daRandomPool, [
      ["e.operating_company_id::text = $1::uuid::text", 1],
      ["WHERE operating_company_id::text = $1::uuid::text", 1],
    ]],
  ]) {
    for (const [needle, minimum] of required) {
      const actual = src.split(needle).length - 1;
      if (actual < minimum) {
        problems.push(
          `${file}: expected at least ${minimum} portable GAP-81 company-scope occurrence(s) of ` +
            `\`${needle}\`, found ${actual}; PROD da_* operating_company_id is TEXT, so a UUID-only ` +
            `comparison or UUID↔TEXT join raises 42883 and the Live surface returns HTTP 500.`
        );
      }
    }
  }

  // 5. A dilute result is not a violation (49 CFR §40.197).
  if (violations && /'dilute'/.test(violations)) {
    problems.push(
      `${GATE}: 'dilute' is being treated as a D&A violation — under 49 CFR §40.197 a dilute negative IS a ` +
        `negative (it may require a recollection; only a refusal that follows is the violation). Blocking on ` +
        `it grounds clean drivers.`
    );
  }

  // 6. One evaluator, and every surface delegates to it.
  for (const fn of ["fetchUnresolvedDrugAlcoholViolation", "fetchClearinghouseProhibition", "evaluateDriverDrugAlcoholStatus"]) {
    if (!new RegExp(`export\\s+(?:async\\s+)?function\\s+${fn}\\b`).test(gate)) {
      problems.push(
        `${GATE}: does not export ${fn} — COMP-01's fix is that ONE evaluator answers "is this driver ` +
          `prohibited?" for every surface. Without the export each surface grows its own narrower copy again.`
      );
    }
  }
  for (const [file, src, what] of [
    [DISPATCH_STATUS, dispatchStatus, "the dispatch driver-eligibility endpoint (GET /api/v1/dispatch/drivers/:id/drug-status)"],
    [SAFETY_STATUS, safetyStatus, "the safety drug-status tile (GET /api/v1/safety/drug-program/drivers/:id/drug-status)"],
  ]) {
    if (!/evaluateDriverDrugAlcoholStatus/.test(src)) {
      problems.push(
        `${file}: ${what} does not call evaluateDriverDrugAlcoholStatus — it is answering the same question ` +
          `the gate enforces with, from its own narrower data, so a prohibited driver can read as eligible on ` +
          `the very screen a dispatcher is looking at.`
      );
    }
  }

  // The safety tile's verdict must not regress to "latest safety.drug_test row".
  if (/is_blocked:\s*isBlockingDrugTestResult\(/.test(safetyStatus)) {
    problems.push(
      `${SAFETY_STATUS}: is_blocked is computed from isBlockingDrugTestResult(latest safety.drug_test row) ` +
        `again — that reads one of three tables, latest-row-only, and ignores the Clearinghouse entirely.`
    );
  }

  // 7. The verdict names which record grounded the driver.
  if (!/drugAlcoholViolationSource/.test(gate)) {
    problems.push(
      `${GATE}: the qualification block does not carry drugAlcoholViolationSource — with three possible ` +
        `sources, a block that cannot say which record grounded the driver is not defensible to a DOT reviewer.`
    );
  }
  for (const [file, src] of [
    [DISPATCH_STATUS, dispatchStatus],
    [SAFETY_STATUS, safetyStatus],
  ]) {
    if (!/block_source/.test(src)) {
      problems.push(`${file}: the drug-status payload does not carry block_source — the screen cannot say which record grounded the driver.`);
    }
  }

  return problems;
}

if (SELFTEST) {
  const live = {
    [GATE]: read(GATE),
    [DISPATCH_STATUS]: read(DISPATCH_STATUS),
    [SAFETY_STATUS]: read(SAFETY_STATUS),
    [SAFETY_HOME]: read(SAFETY_HOME),
    [DA_PROGRAM]: read(DA_PROGRAM),
    [DA_RANDOM_POOL]: read(DA_RANDOM_POOL),
    [SAFETY_LEGACY_ROUTES]: read(SAFETY_LEGACY_ROUTES),
  };
  const failures = [];
  const expectCaught = (name, overrides, needle) => {
    const mutated = { ...live, ...overrides };
    if (JSON.stringify(mutated) === JSON.stringify(live)) {
      failures.push(`${name}: inert mutation — the guard was never actually exercised`);
      return;
    }
    const problems = auditUnifiedDrugAlcoholSource(mutated);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (expected "${needle}", got: ${problems.join(" | ") || "none"})`);
    }
  };

  // THE COMP-01 DEFECT ITSELF: the third live table drops out of the union.
  expectCaught(
    "legacy-drug-test-list-swallows-query-failure",
    {
      [SAFETY_LEGACY_ROUTES]: live[SAFETY_LEGACY_ROUTES].replace(
        "          [query.data.operating_company_id]\n        );\n      return res.rows;",
        "          [query.data.operating_company_id]\n        ).catch(() => ({ rows: [] }));\n      return res.rows;"
      ),
    },
    "false empty compliance roster"
  );
  expectCaught(
    "comp01-reopened-compliance-table-dropped",
    { [GATE]: live[GATE].split("compliance.drug_alcohol_test_results").join("compliance.some_other_table") },
    "the violations union does not read compliance.drug_alcohol_test_results"
  );
  expectCaught(
    "first-table-dropped",
    { [GATE]: live[GATE].split("safety.drug_test dt").join("safety.gone dt") },
    "the violations union does not read safety.drug_test"
  );
  expectCaught(
    "second-table-dropped",
    { [GATE]: live[GATE].split("safety.da_test_records dr2").join("safety.gone dr2") },
    "the violations union does not read safety.da_test_records"
  );
  // Present as a violation source but not as a clearance source — worse than the bug.
  expectCaught(
    "compliance-violations-only-never-clearable",
    { [GATE]: live[GATE].replace(/FROM compliance\.drug_alcohol_test_results ctr2/, "FROM safety.drug_test ctr2") },
    "is a violation source but NOT a clearance source"
  );
  expectCaught(
    "compliance-rtd-keyed-on-the-wrong-column",
    { [GATE]: live[GATE].replace("ctr2.test_reason::text = 'return_to_duty'", "ctr2.test_type::text = 'return_to_duty'") },
    "clearance arm does not key on test_reason"
  );
  expectCaught(
    "compliance-arm-copy-pasted-driver_uuid",
    { [GATE]: live[GATE].replace("WHERE ctr.driver_id = $1::uuid", "WHERE ctr.driver_uuid = $1::uuid") },
    "references driver_uuid"
  );
  expectCaught(
    "compliance-arm-unscoped-cross-entity",
    { [GATE]: live[GATE].replace("AND ctr.operating_company_id = $2::uuid", "") },
    "not scoped by operating_company_id"
  );
  // COMP-01-B: the text-vs-uuid cast that made the whole gate throw.
  expectCaught(
    "gate-da-test-records-scoped-as-uuid-again",
    { [GATE]: live[GATE].split("dr2.operating_company_id::text = $2::uuid::text").join("dr2.operating_company_id = $2::uuid") },
    "casts operating_company_id to ::uuid while reading safety.da_test_records"
  );
  expectCaught(
    "safety-home-da-test-records-scoped-as-uuid-again",
    { [SAFETY_HOME]: live[SAFETY_HOME].replace("operating_company_id::text = $1::uuid::text", "operating_company_id = $1::uuid") },
    "casts operating_company_id to ::uuid while reading safety.da_test_records"
  );
  expectCaught(
    "safety-home-scoping-cast-dropped",
    { [SAFETY_HOME]: live[SAFETY_HOME].replace("operating_company_id::text = $1::uuid::text", "operating_company_id = $1") },
    "does not normalize both safety.da_test_records.operating_company_id"
  );
  expectCaught(
    "program-enrollment-scope-regresses-to-uuid",
    { [DA_PROGRAM]: live[DA_PROGRAM].replace("e.operating_company_id::text = $1::uuid::text", "e.operating_company_id = $1::uuid") },
    "expected at least 1 portable GAP-81 company-scope occurrence"
  );
  expectCaught(
    "program-driver-enrollment-join-regresses-to-mixed-types",
    { [DA_PROGRAM]: live[DA_PROGRAM].replace("d.operating_company_id::text = e.operating_company_id::text", "d.operating_company_id = e.operating_company_id") },
    "UUID↔TEXT join raises 42883"
  );
  expectCaught(
    "program-test-update-scope-regresses-to-uuid",
    { [DA_PROGRAM]: live[DA_PROGRAM].replace("operating_company_id::text = $2::uuid::text", "operating_company_id = $2::uuid") },
    "expected at least 3 portable GAP-81 company-scope occurrence"
  );
  expectCaught(
    "random-pool-enrollment-roster-scope-regresses-to-uuid",
    { [DA_RANDOM_POOL]: live[DA_RANDOM_POOL].replace("e.operating_company_id::text = $1::uuid::text", "e.operating_company_id = $1::uuid") },
    "expected at least 1 portable GAP-81 company-scope occurrence"
  );
  expectCaught(
    "random-draw-history-scope-regresses-to-uuid",
    { [DA_RANDOM_POOL]: live[DA_RANDOM_POOL].replace("WHERE operating_company_id::text = $1::uuid::text", "WHERE operating_company_id = $1::uuid") },
    "expected at least 1 portable GAP-81 company-scope occurrence"
  );
  expectCaught(
    "dilute-becomes-a-violation",
    { [GATE]: live[GATE].replace("AND ctr.result::text IN ('positive', 'refusal')", "AND ctr.result::text IN ('positive', 'refusal', 'dilute')") },
    "'dilute' is being treated as a D&A violation"
  );
  expectCaught(
    "evaluator-no-longer-exported",
    { [GATE]: live[GATE].replace("export async function evaluateDriverDrugAlcoholStatus", "async function evaluateDriverDrugAlcoholStatus") },
    "does not export evaluateDriverDrugAlcoholStatus"
  );
  expectCaught(
    "dispatch-status-stops-delegating",
    { [DISPATCH_STATUS]: live[DISPATCH_STATUS].split("evaluateDriverDrugAlcoholStatus").join("localRecompute") },
    "the dispatch driver-eligibility endpoint (GET /api/v1/dispatch/drivers/:id/drug-status) does not call"
  );
  expectCaught(
    "safety-status-stops-delegating",
    { [SAFETY_STATUS]: live[SAFETY_STATUS].split("evaluateDriverDrugAlcoholStatus").join("localRecompute") },
    "the safety drug-status tile (GET /api/v1/safety/drug-program/drivers/:id/drug-status) does not call"
  );
  expectCaught(
    "safety-tile-regresses-to-latest-drug-test",
    { [SAFETY_STATUS]: live[SAFETY_STATUS].replace("is_blocked: daStatus.is_blocked", "is_blocked: isBlockingDrugTestResult(result)") },
    "is computed from isBlockingDrugTestResult(latest safety.drug_test row)"
  );
  expectCaught(
    "block-cannot-name-its-source",
    { [GATE]: live[GATE].split("drugAlcoholViolationSource").join("someOtherField") },
    "does not carry drugAlcoholViolationSource"
  );
  expectCaught(
    "status-payload-cannot-name-its-source",
    { [DISPATCH_STATUS]: live[DISPATCH_STATUS].split("block_source").join("unused_field") },
    "does not carry block_source"
  );
  // The CTE shape itself is load-bearing for every assertion above.
  expectCaught(
    "violations-cte-restructured-away",
    { [GATE]: live[GATE].split("WITH violations AS").join("WITH gone AS") },
    'no longer has a "WITH violations AS" CTE'
  );

  const liveProblems = auditUnifiedDrugAlcoholSource(live);
  if (liveProblems.length) failures.push(`live sources FAIL (false positive): ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 23 planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = auditUnifiedDrugAlcoholSource();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(
  `${LABEL} OK — one D&A prohibition evaluator over all three live result tables + the FMCSA ` +
    `Clearinghouse; the dispatch gate enforces it and both drug-status surfaces display from it.`
);
