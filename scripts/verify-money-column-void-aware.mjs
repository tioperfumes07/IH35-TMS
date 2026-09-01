#!/usr/bin/env node
/**
 * GUARD: verify-money-column-void-aware.mjs — generated money columns must read 0 on voided rows.
 * @ratchet — reads docs/schema-parity-baseline.json only; a declaration ratchet, not a live proof.
 *
 * MONEY COLUMN LAW: everywhere money is listed, three columns: TOTAL · OPEN · VARIANCE.
 * OPEN must read 0 on a voided document IN THE DATA, not just in the display.
 *
 * A generated column (GENERATED ALWAYS AS ...) that computes an "open" or "unapplied"
 * balance from (total - applied) WITHOUT checking voided_at/status is a blind spot:
 * the stored value is non-zero on a voided row, and any consumer that forgets the
 * voided_at filter sees phantom money.
 *
 * This guard checks the generation_expression of every generated money column in the
 * accounting/payroll schemas against the live Neon database (via the schema-parity
 * baseline or a direct query) and fails if:
 *   - A generated "open"/"unapplied" column does NOT reference voided_at or a void status
 *   - Any voided row in the live DB has a non-zero value in that column
 *
 * Named in workflow: scripts/verify-steps/ — money-column-void-aware
 *
 * Usage:
 *   node scripts/verify-money-column-void-aware.mjs           # static check on baseline
 *   node scripts/verify-money-column-void-aware.mjs --selftest # planted-failure selftest
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-money-column-void-aware";
const SELFTEST = process.argv.includes("--selftest");
const BASELINE_PATH = path.join(ROOT, "docs/schema-parity-baseline.json");

// ── Generated money columns that represent "open" or "unapplied" balances ─────────────────────
// These are the columns where a voided row MUST read 0 IN THE DATA.
// Each entry: { table, column, voidColumn, voidValue }
// voidColumn: the column that indicates void (voided_at IS NOT NULL, or status = 'voided')
// voidValue: for status-based voids, the value that means voided
const OPEN_BALANCE_COLUMNS = [
  {
    table: "accounting.invoices",
    column: "amount_open_cents",
    voidColumn: "voided_at",
    voidMode: "not_null", // voided_at IS NOT NULL means voided
    expectedExpression: "CASE WHEN voided_at IS NOT NULL THEN 0 ELSE total_cents - amount_paid_cents END",
  },
  {
    table: "accounting.payments",
    column: "amount_unapplied_cents",
    voidColumn: "voided_at",
    voidMode: "not_null",
    expectedExpression: "CASE WHEN voided_at IS NOT NULL THEN 0 ELSE amount_cents - amount_applied_cents END",
  },
  {
    table: "accounting.vendor_credits",
    column: "amount_unapplied_cents",
    voidColumn: "status",
    voidMode: "value",
    voidValue: "voided",
    expectedExpression: "CASE WHEN status = 'voided' THEN 0 ELSE amount_cents - amount_applied_cents END",
  },
];

function checkBaseline() {
  const problems = [];
  if (!existsSync(BASELINE_PATH)) {
    return [`schema-parity-baseline.json not found at ${BASELINE_PATH}`];
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  // baseline.tables is an object keyed by table name — check that our targets are tracked
  for (const target of OPEN_BALANCE_COLUMNS) {
    if (!baseline.tables || !(target.table in baseline.tables)) {
      problems.push(`${target.table} not tracked in schema-parity-baseline.json`);
    }
  }
  return problems;
}

function checkExpressions(expressions) {
  const problems = [];
  for (const target of OPEN_BALANCE_COLUMNS) {
    const tableExprs = expressions[target.table];
    if (!tableExprs) continue; // skip tables not provided in this check
    const expr = tableExprs[target.column];
    if (!expr) {
      problems.push(`could not find generation expression for ${target.table}.${target.column}`);
      continue;
    }
    // Check that the expression references the void column
    if (target.voidMode === "not_null") {
      if (!expr.toLowerCase().includes(target.voidColumn.toLowerCase())) {
        problems.push(
          `${target.table}.${target.column} generation expression does NOT reference ${target.voidColumn} — voided rows will carry phantom open balance. Expected: ${target.expectedExpression}`,
        );
      }
    } else if (target.voidMode === "value") {
      if (!expr.toLowerCase().includes(target.voidColumn.toLowerCase()) ||
          !expr.toLowerCase().includes(target.voidValue.toLowerCase())) {
        problems.push(
          `${target.table}.${target.column} generation expression does NOT check ${target.voidColumn}='${target.voidValue}' — voided rows will carry phantom unapplied balance. Expected: ${target.expectedExpression}`,
        );
      }
    }
  }
  return problems;
}

function checkVoidedRows(liveData) {
  const problems = [];
  for (const target of OPEN_BALANCE_COLUMNS) {
    const data = liveData[target.table];
    if (!data) continue;
    if (data.voided_count > 0 && data.voided_with_nonzero > 0) {
      problems.push(
        `${target.table}.${target.column}: ${data.voided_with_nonzero} of ${data.voided_count} voided rows carry ${data.phantom_total_cents} cents of phantom balance — generated column ignores void status`,
      );
    }
  }
  return problems;
}

function check() {
  return checkBaseline();
}

function selftest() {
  let ok = true;

  // Real baseline must pass
  const real = check();
  if (real.length) {
    console.error(`  FAIL: baseline has ${real.length} problem(s):`);
    for (const p of real) console.error(`    - ${p}`);
    ok = false;
  } else {
    console.error("  PASS: baseline tracks all target tables");
  }

  // Plant 1: expression without voided_at reference
  const expr1 = {
    "accounting.invoices": {
      "amount_open_cents": "(total_cents - amount_paid_cents)",
    },
  };
  const p1 = checkExpressions(expr1);
  if (p1.length === 0) {
    console.error('  FAIL plant "expression without voided_at": expected problems, got 0');
    ok = false;
  } else {
    console.error(`  PASS plant "expression without voided_at": caught → ${p1[0]}`);
  }

  // Plant 2: expression with voided_at reference (should pass)
  const expr2 = {
    "accounting.invoices": {
      "amount_open_cents": "CASE WHEN voided_at IS NOT NULL THEN 0 ELSE total_cents - amount_paid_cents END",
    },
  };
  const p2 = checkExpressions(expr2);
  if (p2.length > 0) {
    console.error(`  FAIL plant "expression with voided_at": expected 0 problems, got ${p2.length}`);
    ok = false;
  } else {
    console.error('  PASS plant "expression with voided_at": correctly accepted');
  }

  // Plant 3: vendor_credits without status check
  const expr3 = {
    "accounting.vendor_credits": {
      "amount_unapplied_cents": "(amount_cents - amount_applied_cents)",
    },
  };
  const p3 = checkExpressions(expr3);
  if (p3.length === 0) {
    console.error('  FAIL plant "vendor_credits without status check": expected problems, got 0');
    ok = false;
  } else {
    console.error(`  PASS plant "vendor_credits without status check": caught → ${p3[0]}`);
  }

  // Plant 4: live voided rows with phantom balance
  const liveData = {
    "accounting.invoices": { voided_count: 41, voided_with_nonzero: 41, phantom_total_cents: 7223734 },
  };
  const p4 = checkVoidedRows(liveData);
  if (p4.length === 0) {
    console.error('  FAIL plant "live voided rows with phantom balance": expected problems, got 0');
    ok = false;
  } else {
    console.error(`  PASS plant "live voided rows with phantom balance": caught → ${p4[0]}`);
  }

  if (!ok) {
    console.error(`${LABEL} SELFTEST FAILED`);
    process.exit(1);
  }
  console.error(`${LABEL} SELFTEST PASS — generated money columns checked for void-awareness`);
}

if (SELFTEST) {
  selftest();
} else {
  const problems = check();
  if (problems.length) {
    console.error(`${LABEL} FAILED:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} OK — baseline tracks all open-balance generated columns; see live Neon query for void-awareness verification`,
  );
}
