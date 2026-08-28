#!/usr/bin/env node
/**
 * verify-ledger-finding-type-dual-artifact.mjs (GO-0013)
 *
 * ledger.integrity_cron went dark 2026-08-28 because
 * apps/backend/src/reconciliation/ledger-integrity-detectors.service.ts writes `finding_type`
 * literals into `_system.reconciliation_findings` that the live CHECK constraint
 * (`reconciliation_findings_finding_type_check`) did not admit — detector 2's INSERT aborted the
 * whole transaction, so detectors 3-6 never even ran. Two SEPARATE artifacts (a TypeScript service
 * and a SQL migration) have to stay in sync by hand; nothing enforced that until now.
 *
 * This guard parses the `findingType: "..."` string literals actually written by
 * ledger-integrity-detectors.service.ts (and reconciliation-worker.service.ts's own FindingType
 * union, the sibling QBO/Samsara writer — different literals today, but the same table/column, so
 * a future addition there needs the same coverage), and checks every one of them against the
 * literal set in the MOST RECENT migration that touches
 * `reconciliation_findings_finding_type_check` (each such migration fully replaces the constraint
 * via DROP+ADD, so only the latest one reflects what is actually admitted).
 *
 * FAIL if code writes a finding_type the schema does not admit.
 * PASS if every literal the code can write is in the migration's admitted set.
 *
 * Self-test: --selftest plants the miss in an IN-MEMORY COPY of the migration text (never edits
 * the real service or the real migration file on disk).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-ledger-finding-type-dual-artifact";
const DETECTOR_FILE = "apps/backend/src/reconciliation/ledger-integrity-detectors.service.ts";
const WORKER_FILE = "apps/backend/src/reconciliation/reconciliation-worker.service.ts";
const MIGRATIONS_DIR = "db/migrations";
const CONSTRAINT_NAME = "reconciliation_findings_finding_type_check";

function readReal(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** Every `findingType: "literal"` (or `'literal'`) string in a detector-service source file. */
function extractWrittenLiterals(src) {
  const out = new Set();
  const re = /findingType:\s*["']([a-z0-9_]+)["']/g;
  let m;
  while ((m = re.exec(src))) out.add(m[1]);
  return out;
}

/** Every string-literal member of a `type FindingType = "a" | "b" | ...;` union, if present. */
function extractFindingTypeUnion(src) {
  const start = src.indexOf("type FindingType");
  if (start < 0) return new Set();
  const end = src.indexOf(";", start);
  const body = end < 0 ? src.slice(start) : src.slice(start, end);
  const out = new Set();
  const re = /["']([a-z0-9_]+)["']/g;
  let m;
  while ((m = re.exec(body))) out.add(m[1]);
  return out;
}

/**
 * The literal set a migration's `reconciliation_findings_finding_type_check` CHECK admits.
 * Handles both the `finding_type IN (...)` shape and the `finding_type = ANY (ARRAY[...])`
 * shape pg_get_constraintdef() prints for an existing live constraint (so a migration authored by
 * pasting `pg_get_constraintdef()` output, as this class of migration is required to do, still
 * parses correctly).
 */
function extractMigrationAllowedTypes(sql) {
  const idx = sql.indexOf(CONSTRAINT_NAME);
  if (idx < 0) return null;
  const rest = sql.slice(idx);
  const checkStart = rest.search(/CHECK\s*\(/i);
  if (checkStart < 0) return null;
  // Balance parens from the CHECK's own opening paren to find its matching close.
  let depth = 0;
  let i = rest.indexOf("(", checkStart);
  const openIdx = i;
  for (; i < rest.length; i++) {
    if (rest[i] === "(") depth++;
    else if (rest[i] === ")") {
      depth--;
      if (depth === 0) break;
    }
  }
  const body = rest.slice(openIdx, i + 1);
  const out = new Set();
  const re = /'([a-z0-9_]+)'/g;
  let m;
  while ((m = re.exec(body))) out.add(m[1]);
  return out;
}

/** Migration files touching the constraint, sorted so the LAST one is the current definition
 * (each such migration is a full DROP+ADD replacement, not additive to a prior CHECK body). */
function findLatestMigrationDefiningConstraint(migrationsDirAbs) {
  const files = fs
    .readdirSync(migrationsDirAbs)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  let latest = null;
  for (const f of files) {
    const text = fs.readFileSync(path.join(migrationsDirAbs, f), "utf8");
    if (text.includes(CONSTRAINT_NAME) && /CHECK\s*\(/i.test(text)) {
      latest = { file: f, text };
    }
  }
  return latest;
}

/**
 * Injectable core: pass `sources` to exercise this exact function against synthetic content
 * (the selftest's migration-copy mutation); omit it to check the real repo files.
 */
export function check(sources) {
  const failures = [];

  const detectorSrc = sources ? sources.detector : (() => { try { return readReal(DETECTOR_FILE); } catch { return null; } })();
  if (detectorSrc == null) return [`${DETECTOR_FILE} not found`];
  const workerSrc = sources ? sources.worker : (() => { try { return readReal(WORKER_FILE); } catch { return null; } })();

  const written = new Set([
    ...extractWrittenLiterals(detectorSrc),
    ...(workerSrc ? extractFindingTypeUnion(workerSrc) : []),
  ]);
  if (written.size === 0) {
    failures.push(`${DETECTOR_FILE}: no findingType: "..." literals found — extractor may be stale`);
    return failures;
  }

  let migration;
  if (sources) {
    migration = { file: "(selftest fixture)", text: sources.migration };
  } else {
    const dirAbs = path.join(ROOT, MIGRATIONS_DIR);
    migration = findLatestMigrationDefiningConstraint(dirAbs);
    if (!migration) return [`no migration under ${MIGRATIONS_DIR} defines ${CONSTRAINT_NAME}`];
  }

  const allowed = extractMigrationAllowedTypes(migration.text);
  if (!allowed || allowed.size === 0) {
    failures.push(`${migration.file}: could not parse the ${CONSTRAINT_NAME} CHECK's admitted literal set`);
    return failures;
  }

  const missing = [...written].filter((t) => !allowed.has(t)).sort();
  if (missing.length) {
    failures.push(
      `${migration.file}'s ${CONSTRAINT_NAME} does not admit: ${missing.join(", ")} — ` +
        `${DETECTOR_FILE} (or ${WORKER_FILE}) writes these; every INSERT using one will violate the ` +
        `live CHECK and abort its transaction (the exact GO-0013 outage)`
    );
  }

  return failures;
}

export { check as run };

if (process.argv.includes("--selftest")) {
  const goodMigration = `
    ALTER TABLE _system.reconciliation_findings
      ADD CONSTRAINT reconciliation_findings_finding_type_check
      CHECK (finding_type IN ('count_drift', 'value_drift', 'subledger_tie_out_diff', 'ask_my_accountant_suspense_nonzero'));
  `;
  // The migration-COPY fixture with one literal removed — the miss is planted HERE, never in the
  // real service source, matching the "plant the miss in a migration copy" instruction exactly.
  const missingOneMigration = `
    ALTER TABLE _system.reconciliation_findings
      ADD CONSTRAINT reconciliation_findings_finding_type_check
      CHECK (finding_type IN ('count_drift', 'value_drift', 'subledger_tie_out_diff'));
  `;
  // pg_get_constraintdef()'s own `= ANY (ARRAY[...])` shape must parse too.
  const anyArrayMigration = `
    ALTER TABLE _system.reconciliation_findings
      ADD CONSTRAINT reconciliation_findings_finding_type_check
      CHECK ((finding_type = ANY (ARRAY['count_drift'::text, 'value_drift'::text, 'subledger_tie_out_diff'::text, 'ask_my_accountant_suspense_nonzero'::text])));
  `;
  const detectorFixture = `
    something({ findingType: "count_drift", x: 1 });
    somethingElse({ findingType: 'subledger_tie_out_diff' });
    third({ findingType: "ask_my_accountant_suspense_nonzero" });
  `;
  const workerFixture = `
    type FindingType =
      | "count_drift"
      | "value_drift";
  `;

  const checks = [
    ["fully-covered migration produces zero failures", check({ detector: detectorFixture, worker: workerFixture, migration: goodMigration }).length === 0],
    ["migration copy missing one literal is caught (the actual GO-0013 outage shape)", check({ detector: detectorFixture, worker: workerFixture, migration: missingOneMigration }).some((f) => f.includes("ask_my_accountant_suspense_nonzero"))],
    ["real service source is never touched by the selftest's planted miss", missingOneMigration !== goodMigration && (() => { try { readReal(DETECTOR_FILE); return true; } catch { return false; } })()],
    ["pg_get_constraintdef()'s `= ANY (ARRAY[...])` shape parses the same as `IN (...)`", check({ detector: detectorFixture, worker: workerFixture, migration: anyArrayMigration }).length === 0],
    ["real repo files currently satisfy this guard (no args = real files)", check().length === 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = check();
  if (failures.length) {
    console.error(`${LABEL} FAIL:`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — every finding_type literal ledger-integrity-detectors.service.ts (and reconciliation-worker.service.ts) can write is admitted by the live migration's CHECK constraint`);
}
