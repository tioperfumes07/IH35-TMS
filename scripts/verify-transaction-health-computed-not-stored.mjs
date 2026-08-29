#!/usr/bin/env node
/**
 * SYS-F-TRANSACTION-HEALTH-REGISTER (TXH-01, GO-0010) — THE LOAD-BEARING RULE.
 *
 * "Read-only. Additive. NO migration, NO new table, NO health_status/transaction_status/is_healthy
 * column. Status is computed at read time from the ledger and never stored." This guard enforces
 * that rule against both the service/route source AND the migrations directory, per the spec's own
 * acceptance checklist:
 *   1. No migration adds a health/status column to any document table.
 *   2. transaction-health.service.ts issues no INSERT/UPDATE/DELETE.
 *   3. "posted" is computed from journal_entry_postings source_transaction_type/source_transaction_id
 *      (or a direct FK the table already carries), never a document-level status/health column.
 *   4. The RLS bypass runs through withLuciaBypass (SET LOCAL app.bypass_rls as its own statement —
 *      never a CTE wrapping set_config, which is invisible to the surrounding transaction).
 *   5. Every document branch filters explicitly by operating_company_id = ANY(...).
 *   6. factoring_batch's sample_consistent is always NULL::boolean — it can never be planted "OK".
 *   7. At least all 8 spec document types (invoice/bill/bill_payment/customer_payment/expense/
 *      journal_entry/factoring_batch/settlement) are wired — a branch silently dropped to 0 is a
 *      regression, not a valid state.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const SERVICE_FILE = "apps/backend/src/system/transaction-health.service.ts";
const ROUTES_FILE = "apps/backend/src/system/transaction-health.routes.ts";
const EVIDENCE_FILE = "apps/backend/src/system/transaction-health-evidence.ts";
const PAGE_FILE = "apps/frontend/src/pages/system/SystemModulePage.tsx";
const MIGRATIONS_DIR = "db/migrations";

const FORBIDDEN_COLUMN_NAMES = ["health_status", "transaction_status", "is_healthy"];
const REQUIRED_DOC_TYPES = [
  "invoice",
  "bill",
  "bill_payment",
  "customer_payment",
  "expense",
  "journal_entry",
  "factoring_batch",
  "settlement",
];

// Strip /** ... */ block comments and // line comments so this guard's own explanatory prose (which
// quotes the forbidden column names verbatim, on purpose, so the next reader knows what NOT to add)
// can never trip its own checks. Postgres string literals in the SELECT lists never contain `/*` or
// `//`, so this is safe for these two files.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function extractTxHealthTab(pageSrc) {
  const match = pageSrc.match(/function TransactionHealthTab\(\) \{[\s\S]*?\nfunction /);
  return match ? match[0] : "";
}

export function check({ serviceSrc: serviceSrcRaw, routesSrc: routesSrcRaw, migrationFiles, evidenceSrc: evidenceSrcRaw = "", pageSrc = "" }) {
  const serviceSrc = stripComments(serviceSrcRaw);
  const routesSrc = stripComments(routesSrcRaw);
  const evidenceSrc = stripComments(evidenceSrcRaw);
  const failures = [];

  // 1. No migration adds a forbidden health/status column.
  for (const file of migrationFiles) {
    const migSrc = fs.readFileSync(path.join(root, MIGRATIONS_DIR, file), "utf8");
    for (const col of FORBIDDEN_COLUMN_NAMES) {
      const addColumnRe = new RegExp(`ADD\\s+COLUMN[^;]*\\b${col}\\b`, "i");
      const createTableRe = new RegExp(`CREATE\\s+TABLE[^;]*\\b${col}\\b`, "is");
      if (addColumnRe.test(migSrc) || createTableRe.test(migSrc)) {
        failures.push(`${MIGRATIONS_DIR}/${file}: adds forbidden column "${col}" — TXH-01 status must be computed at read time, never stored`);
      }
    }
  }

  // 2. No INSERT/UPDATE/DELETE in the service or evidence enricher.
  if (/\bINSERT\s+INTO\b|\bUPDATE\s+\w+\s|\bDELETE\s+FROM\b/i.test(serviceSrc)) {
    failures.push(`${SERVICE_FILE}: contains an INSERT/UPDATE/DELETE — this must stay read-only`);
  }
  if (/\bINSERT\s+INTO\b|\bUPDATE\s+\w+\s|\bDELETE\s+FROM\b/i.test(evidenceSrc)) {
    failures.push(`${EVIDENCE_FILE}: contains an INSERT/UPDATE/DELETE — this must stay read-only`);
  }

  // 3. "posted" never reads a document-level status/health column (only journal_entry_postings joins
  //    or a direct *_id FK already on the document table).
  for (const col of FORBIDDEN_COLUMN_NAMES) {
    if (serviceSrc.includes(col)) {
      failures.push(`${SERVICE_FILE}: references forbidden column name "${col}"`);
    }
  }

  // 4. Bypass goes through withLuciaBypass, not an ad hoc set_config.
  if (!/withLuciaBypass/.test(routesSrc)) {
    failures.push(`${ROUTES_FILE}: does not use withLuciaBypass — TXH-01 requires SET LOCAL app.bypass_rls as its own statement`);
  }
  if (/WITH\s+\w+\s+AS\s*\(\s*SELECT\s+set_config/i.test(serviceSrc)) {
    failures.push(`${SERVICE_FILE}: bypass_rls set via a CTE — TXH-01 explicitly forbids this shape`);
  }

  // 5. Every document branch filters by operating_company_id = ANY(...).
  const branchesMatch = serviceSrc.match(/const BRANCHES: string\[\] = (\[[\s\S]*?\n\]);/);
  if (!branchesMatch) {
    failures.push(`${SERVICE_FILE}: BRANCHES array not found — guard out of sync`);
  } else {
    let branches;
    try {
      // eslint-disable-next-line no-new-func -- static analysis of a literal array of SQL strings
      branches = Function(`"use strict"; return ${branchesMatch[1]};`)();
    } catch {
      failures.push(`${SERVICE_FILE}: BRANCHES array could not be parsed — guard out of sync`);
      branches = [];
    }
    if (branches.length !== REQUIRED_DOC_TYPES.length) {
      failures.push(`${SERVICE_FILE}: expected ${REQUIRED_DOC_TYPES.length} document branches, found ${branches.length}`);
    }
    for (const [idx, docType] of REQUIRED_DOC_TYPES.entries()) {
      const b = branches[idx] ?? "";
      if (!b.includes(`'${docType}'`)) {
        failures.push(`${SERVICE_FILE}: branch ${idx} does not declare doc_type '${docType}' (order-sensitive — see BRANCHES)`);
      }
      if (!/operating_company_id\s*=\s*ANY\s*\(\$1::uuid\[\]\)/.test(b)) {
        failures.push(`${SERVICE_FILE}: '${docType}' branch is missing an explicit operating_company_id = ANY($1::uuid[]) filter`);
      }
    }

    // 6. factoring_batch's sample_consistent (last column) is always NULL::boolean, never computed.
    const factoringBranch = branches[REQUIRED_DOC_TYPES.indexOf("factoring_batch")] ?? "";
    const trailingNulls = (factoringBranch.match(/NULL::boolean/g) ?? []).length;
    if (trailingNulls < 2) {
      failures.push(
        `${SERVICE_FILE}: factoring_batch branch must hardcode both is_sample_data and sample_consistent as NULL::boolean (UNVERIFIABLE) — found ${trailingNulls}`
      );
    }
  }

  // TXH-03 screen: two-pane wiring map stays on-page (list click does not navigate).
  const tab = extractTxHealthTab(pageSrc);
  if (tab && !tab.includes("<pre")) {
    failures.push(`${PAGE_FILE}: TransactionHealthTab must render a monospace <pre ledger`);
  }
  if (pageSrc && !pageSrc.includes("<svg")) {
    failures.push(`${PAGE_FILE}: must include an <svg wiring map`);
  }
  if (tab && !tab.includes("links[].state")) {
    failures.push(`${PAGE_FILE}: TransactionHealthTab must include the literal string links[].state`);
  }
  if (tab && !tab.includes("gl.lines")) {
    failures.push(`${PAGE_FILE}: TransactionHealthTab must include the literal string gl.lines`);
  }
  if (tab && /\bnavigate\s*\(/.test(tab)) {
    failures.push(`${PAGE_FILE}: TransactionHealthTab must not call navigate( — list click stays on the page`);
  }
  if (pageSrc && !pageSrc.includes("blocked_by_constraint")) {
    failures.push(`${PAGE_FILE}: wiring map must render blocked_by_constraint as its own state, not a silent default`);
  }

  return failures;
}

function readAll() {
  return {
    serviceSrc: fs.readFileSync(path.join(root, SERVICE_FILE), "utf8"),
    routesSrc: fs.readFileSync(path.join(root, ROUTES_FILE), "utf8"),
    evidenceSrc: fs.readFileSync(path.join(root, EVIDENCE_FILE), "utf8"),
    pageSrc: fs.readFileSync(path.join(root, PAGE_FILE), "utf8"),
    migrationFiles: fs.readdirSync(path.join(root, MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")),
  };
}

function run() {
  const failures = check(readAll());
  if (failures.length > 0) {
    console.error("FAIL: transaction-health-computed-not-stored");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: SYS-F-TRANSACTION-HEALTH-REGISTER stays read-only and computed-at-read-time (no stored status column)");
}

function selftest() {
  const baseline = readAll();
  const baselineFailures = check(baseline);
  if (baselineFailures.length !== 0) {
    console.error("FAIL(selftest): baseline (current HEAD) is not clean:", baselineFailures);
    process.exit(1);
  }

  // Offender A: plant a forbidden column reference in actual code (not a comment — comments are
  // deliberately stripped before this check runs, since this file's own header prose quotes the
  // forbidden names on purpose).
  const offenderA = check({ ...baseline, serviceSrc: baseline.serviceSrc + '\nconst x = row.health_status;\n' });
  if (offenderA.length === 0) {
    console.error("FAIL(selftest): planted offender A (forbidden column name in service) was NOT caught");
    process.exit(1);
  }

  // Offender B: plant an UPDATE in the service.
  const offenderB = check({ ...baseline, serviceSrc: baseline.serviceSrc + "\nawait client.query('UPDATE foo SET x = 1');\n" });
  if (offenderB.length === 0) {
    console.error("FAIL(selftest): planted offender B (UPDATE in service) was NOT caught");
    process.exit(1);
  }

  // Offender C: routes no longer uses withLuciaBypass.
  const offenderC = check({ ...baseline, routesSrc: baseline.routesSrc.replace(/withLuciaBypass/g, "withSomethingElse") });
  if (offenderC.length === 0) {
    console.error("FAIL(selftest): planted offender C (withLuciaBypass removed) was NOT caught");
    process.exit(1);
  }

  // Offender D: a migration adds a forbidden column.
  const offenderD = check({
    ...baseline,
    migrationFiles: [...baseline.migrationFiles],
  });
  // Simulate via a synthetic in-memory migration by monkeypatching readFileSync is overkill here —
  // instead directly assert the column-name regex catches a representative DDL fragment.
  const ddl = "ALTER TABLE accounting.invoices ADD COLUMN health_status text;";
  const hasForbidden = FORBIDDEN_COLUMN_NAMES.some((col) => new RegExp(`ADD\\s+COLUMN[^;]*\\b${col}\\b`, "i").test(ddl));
  if (!hasForbidden) {
    console.error("FAIL(selftest): offender D pattern (migration ADD COLUMN health_status) not detected by the regex — guard out of sync");
    process.exit(1);
  }
  void offenderD;

  // Offender E: remove the SVG wiring map from the page.
  const offenderE = check({ ...baseline, pageSrc: baseline.pageSrc.replaceAll("<svg", "<div") });
  if (offenderE.length === 0) {
    console.error("FAIL(selftest): planted offender E (removed <svg) was NOT caught");
    process.exit(1);
  }

  // Offender F: list click navigates away instead of setSelectedKey.
  // If the plant string does not match the source, the assertion never fires — that is a
  // closed loop. Fail closed when the mutation does not apply, and require the navigate() finding.
  const plantFrom = "onClick={() => setSelectedKey(key)}";
  const plantTo = "onClick={() => navigate(txHealthDocumentPath(row))}";
  if (!baseline.pageSrc.includes(plantFrom)) {
    console.error("FAIL(selftest): offender F plant target onClick={() => setSelectedKey(key)} is missing from the page — selftest out of sync");
    process.exit(1);
  }
  const plantedF = baseline.pageSrc.replace(plantFrom, plantTo);
  if (plantedF === baseline.pageSrc) {
    console.error("FAIL(selftest): offender F plant did not change the page source");
    process.exit(1);
  }
  const offenderF = check({ ...baseline, pageSrc: plantedF });
  if (!offenderF.some((f) => f.includes("must not call navigate("))) {
    console.error("FAIL(selftest): planted offender F (navigate on list click) was NOT caught");
    process.exit(1);
  }

  // Offender G: drop the fourth wiring state so it falls through to a default.
  const plantedG = baseline.pageSrc.replaceAll("blocked_by_constraint", "blocked_PLANTED");
  if (plantedG === baseline.pageSrc) {
    console.error("FAIL(selftest): offender G plant did not change the page source");
    process.exit(1);
  }
  const offenderG = check({ ...baseline, pageSrc: plantedG });
  if (!offenderG.some((f) => f.includes("blocked_by_constraint"))) {
    console.error("FAIL(selftest): planted offender G (blocked_by_constraint removed) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): all planted regressions correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
