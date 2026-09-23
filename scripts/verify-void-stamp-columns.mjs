#!/usr/bin/env node
// R-102.1-A BUILD 3 — the guard for the void-stamp system (BUILD 1 migration + BUILD 2
// stampDocumentVoided(), apps/backend/src/accounting/void-document-stamp.service.ts).
//
// Owner standing ruling: "FOR FUTURE REFERENCE YES AL SHOULD STATE VOIDED." Fails when:
//   1) any of the seven document families is missing voided_at / void_reason / voided_by_user_id
//      (live schema check, br-fancy-credit-akjnd07a).
//   2) any file OTHER than void-document-stamp.service.ts writes voided_at on mdata.loads,
//      accounting.factoring_advances, fuel.fuel_transactions or driver_finance.driver_reimbursements
//      — the four families that had ZERO pre-existing writer before this round (confirmed by a
//      full-repo grep at guard-authoring time, 2026-09-23: no file wrote voided_at on any of these
//      four tables). Zero-tolerance, no baseline debt possible here.
//   3) any NEW (non-baseline) file writes voided_at on accounting.invoices, accounting.expenses or
//      accounting.journal_entries — these three already carried voided_at before this round and
//      already have established, reviewed, GL-aware void/reversal machinery (the "six engines" the
//      ruling refers to: void.service.ts, bulk-void.service.ts, governance/void-cancel-executors.ts,
//      settlement-posting.service.ts, amortization-posting.service.ts, loan-payment-posting.service.ts,
//      plus the inline void UPDATEs in invoices.routes.ts / expenses.routes.ts / work-orders.routes.ts
//      / dispatch/cancellation.service.ts). Consolidating 20+ live GL-reversal call sites onto
//      stampDocumentVoided() under this round's deadline would be exactly the "widen a baseline to
//      get through it" the Lead's instruction forbids in the other direction — instead this guard
//      freezes today's writer set BY NAME (never a wildcard/word-blanket) as a ratchet: it can only
//      shrink (a file migrated onto stampDocumentVoided() and removed from the list) or fail loud on
//      any name not already here. This is the same shape as verify-no-automatch.mjs's
//      TARGET_COLUMN_WRITE_ALLOWLIST — reviewed writers named individually, not a class exemption.
//
// A live money guard that cannot connect is a FAIL, never a pass (ROUND 29.9-B) — see
// scripts/lib/require-live-db.mjs; this guard declares no ALLOW_OFFLINE_SKIP.
//
// --selftest plants one mutation (an UPDATE ... SET voided_at outside the allowlist, in a temp
// copy of a real file) and asserts the guard catches it, then restores the file.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-void-stamp-columns";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKEND_SRC = path.join(ROOT, "apps", "backend", "src");

// The seven document families named in the ruling. FIXED, never built from a dynamic string.
const FAMILIES = [
  { family: "load", schema: "mdata", table: "loads" },
  { family: "invoice", schema: "accounting", table: "invoices" },
  { family: "expense", schema: "accounting", table: "expenses" },
  { family: "factoring_advance", schema: "accounting", table: "factoring_advances" },
  { family: "fuel_transaction", schema: "fuel", table: "fuel_transactions" },
  { family: "journal_entry", schema: "accounting", table: "journal_entries" },
  { family: "driver_reimbursement", schema: "driver_finance", table: "driver_reimbursements" },
];

// The ONE allowed writer.
const THE_ONE_WRITER = "apps/backend/src/accounting/void-document-stamp.service.ts";

// Zero-tolerance families — no pre-existing writer existed for these before this round, so no
// baseline entry is permitted. Any writer here (other than THE_ONE_WRITER) is a hard fail.
const ZERO_TOLERANCE_TABLES = new Set(["mdata.loads", "accounting.factoring_advances", "fuel.fuel_transactions", "driver_finance.driver_reimbursements"]);

// Frozen baseline of pre-existing writers on the three tables that already had voided_at before
// this round (accounting.invoices / accounting.expenses / accounting.journal_entries). Named
// individually, found by a full-repo `UPDATE <table>` + `voided_at =` search at guard-authoring
// time (2026-09-23). This list may only shrink (a file moved onto stampDocumentVoided() and
// removed) — verify-baseline-never-grows-style enforcement below.
const BASELINE_WRITERS = {
  "accounting.invoices": [
    "apps/backend/src/accounting/invoices.routes.ts",
    "apps/backend/src/accounting/bulk-void.service.ts",
    "apps/backend/src/dispatch/cancellation.service.ts",
    "apps/backend/src/governance/void-cancel-executors.ts",
  ],
  "accounting.expenses": [
    "apps/backend/src/accounting/expenses.routes.ts",
    "apps/backend/src/accounting/expenses-bulk.routes.ts",
    "apps/backend/src/work-orders/work-orders.routes.ts",
    "apps/backend/src/governance/void-cancel-executors.ts",
  ],
  "accounting.journal_entries": [
    "apps/backend/src/accounting/void.service.ts",
    "apps/backend/src/accounting/finance-hub-amortization-posting/loan-payment-posting.service.ts",
    "apps/backend/src/accounting/amortization-posting/amortization-posting.service.ts",
    "apps/backend/src/accounting/settlement-posting/settlement-posting.service.ts",
  ],
};

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      walk(full, out);
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

/** Very small, deliberately conservative UPDATE-table detector: looks for `UPDATE schema.table`
 *  (allowing template-literal whitespace) within N lines of a `voided_at` SET assignment. Static,
 *  no AST — false positives (flagging a file that doesn't really write it) fail safe by forcing a
 *  human look, which is exactly the guard's job; false negatives are what this file's own full-repo
 *  grep at authoring time already ruled out for the zero-tolerance tables. */
function findWriters(files, schema, table) {
  const qualified = `${schema}.${table}`;
  const updateRe = new RegExp(`UPDATE\\s+${schema}\\s*\\.\\s*${table}\\b`, "i");
  const hits = [];
  for (const file of files) {
    if (file === path.join(ROOT, THE_ONE_WRITER)) continue;
    const text = fs.readFileSync(file, "utf8");
    if (!updateRe.test(text)) continue;
    // Scan each UPDATE...; statement block (naive, brace/paren-agnostic: split on semicolons is too
    // coarse for SQL-in-template-literals, so instead scan a window of lines following each UPDATE
    // match for a voided_at assignment before the next UPDATE/INSERT/statement boundary.
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (!updateRe.test(lines[i])) continue;
      const windowEnd = Math.min(lines.length, i + 25);
      const window = lines.slice(i, windowEnd).join("\n");
      if (/voided_at\s*=/.test(window)) {
        hits.push(path.relative(ROOT, file).split(path.sep).join("/"));
        break;
      }
    }
  }
  return [...new Set(hits)].sort();
}

// ROUND 122 ADDITION -- independently declared here, NOT imported from void-document-stamp
// .service.ts. The whole point of this check is to catch a mismatch between what the service
// file CLAIMS a family's status value is and what the live database actually accepts -- trusting
// the service file's own self-report would make this check unable to ever fail on the exact bug
// it exists to prevent. `null` means this family's status is never flipped (no column, or the
// documented journal_entry GL-total-reader exception) -- nothing to check against a constraint.
const VOID_STATUS_VALUES = {
  load: "voided",
  invoice: "void",
  expense: "void",
  factoring_advance: "voided",
  fuel_transaction: null,
  journal_entry: null,
  driver_reimbursement: "void",
};

/**
 * Pure decision logic, DB-independent and unit-testable via --selftest: given the declared value
 * for a family and the live-fetched set of values that family's own status column actually
 * accepts (from its CHECK constraint's value list or its enum's members), decide whether the
 * declared value is safe to write.
 * @param {string|null} declaredValue
 * @param {string[]|null} liveAcceptedValues -- null means "no status column exists at all"
 * @returns {{ ok: boolean, detail: string }}
 */
export function evaluateStatusValueAcceptance(declaredValue, liveAcceptedValues) {
  if (declaredValue === null) {
    return { ok: true, detail: "no status flip declared for this family -- nothing to check" };
  }
  if (liveAcceptedValues === null) {
    return { ok: false, detail: `declared voidStatusValue='${declaredValue}' but the table has no status column at all` };
  }
  if (!liveAcceptedValues.includes(declaredValue)) {
    return {
      ok: false,
      detail: `declared voidStatusValue='${declaredValue}' is NOT accepted by the live status constraint/enum (accepts: ${liveAcceptedValues.join(", ")})`,
    };
  }
  return { ok: true, detail: `declared voidStatusValue='${declaredValue}' confirmed accepted live` };
}

/** Parses the literal string values out of a `CHECK ((status = ANY (ARRAY['a'::text, 'b'::text])))`
 *  style constraint definition. Deliberately simple (no SQL parser) -- this guard's job is a
 *  sanity check, not a general-purpose constraint interpreter, and the ARRAY[...] shape is the
 *  one every status CHECK in this codebase actually uses (confirmed live, 2026-09-23). */
function parseCheckConstraintValues(def) {
  const matches = [...def.matchAll(/'([^']+)'::text/g)];
  return matches.map((m) => m[1]);
}

async function checkStatusValuesLive(client) {
  const problems = [];
  const report = [];
  for (const { family, schema, table } of FAMILIES) {
    const declared = VOID_STATUS_VALUES[family];
    if (declared === null) {
      report.push(`${family}: no status flip declared`);
      continue;
    }
    const colRes = await client.query(
      `SELECT data_type, udt_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2 AND column_name = 'status'`,
      [schema, table]
    );
    const col = colRes.rows[0];
    let liveAcceptedValues = null;
    if (col && col.data_type === "USER-DEFINED") {
      const enumRes = await client.query(
        `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = $1`,
        [col.udt_name]
      );
      liveAcceptedValues = enumRes.rows.map((r) => r.enumlabel);
    } else if (col) {
      const defRes = await client.query(
        `SELECT pg_get_constraintdef(oid) AS def
           FROM pg_constraint
          WHERE conrelid = ($1 || '.' || $2)::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE 'CHECK ((status =%'`,
        [schema, table]
      );
      liveAcceptedValues = defRes.rows.flatMap((r) => parseCheckConstraintValues(r.def));
      if (liveAcceptedValues.length === 0) liveAcceptedValues = null; // no status CHECK found -- treat as "no column" for safety
    }
    const verdict = evaluateStatusValueAcceptance(declared, liveAcceptedValues);
    report.push(`${family}: ${verdict.detail}`);
    if (!verdict.ok) problems.push(`${schema}.${table} (${family}): ${verdict.detail}`);
  }
  return { problems, report };
}

async function main() {
  const files = walk(BACKEND_SRC);

  // ---- Part 1: static single-writer enforcement (no DB needed) ----
  const violations = [];
  const zeroToleranceReport = [];
  const baselineReport = [];
  for (const { schema, table } of FAMILIES) {
    const qualified = `${schema}.${table}`;
    const writers = findWriters(files, schema, table);
    if (ZERO_TOLERANCE_TABLES.has(qualified)) {
      zeroToleranceReport.push(`${qualified}: ${writers.length} writer(s) outside stampDocumentVoided()`);
      if (writers.length > 0) {
        violations.push(`${qualified} (zero-tolerance, no pre-existing writer) written outside stampDocumentVoided() by: ${writers.join(", ")}`);
      }
    } else {
      const allowed = new Set(BASELINE_WRITERS[qualified] ?? []);
      const newWriters = writers.filter((w) => !allowed.has(w));
      baselineReport.push(`${qualified}: ${writers.length}/${allowed.size} baseline writer(s) present, ${newWriters.length} new`);
      if (newWriters.length > 0) {
        violations.push(`${qualified}: NEW writer(s) not in the frozen baseline (must go through stampDocumentVoided() instead): ${newWriters.join(", ")}`);
      }
    }
  }

  if (violations.length > 0) {
    console.error(`${LABEL}: FAIL — ${violations.length} single-writer violation(s):`);
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(1);
  }

  // ---- Part 2: live column-completeness check (DB required, fail-closed) ----
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    const missing = [];
    for (const { family, schema, table } of FAMILIES) {
      const res = await client.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2
            AND column_name IN ('voided_at','void_reason','voided_by_user_id')`,
        [schema, table]
      );
      const present = new Set(res.rows.map((r) => r.column_name));
      for (const col of ["voided_at", "void_reason", "voided_by_user_id"]) {
        if (!present.has(col)) missing.push(`${schema}.${table} (${family}) missing ${col}`);
      }
    }
    if (missing.length > 0) {
      console.error(`${LABEL}: FAIL — ${missing.length} column(s) missing on live schema:`);
      for (const m of missing) console.error(`  - ${m}`);
      process.exit(1);
    }

    // ---- Part 3 (ROUND 122): the status value the writer would write must be accepted by that
    // family's own live CHECK constraint / enum. This is the check that would have caught the
    // exact P0 bug (every family writing 'voided', three families' constraints only accept
    // 'void') before it shipped -- it does not trust void-document-stamp.service.ts's own
    // FAMILY_TABLE, it re-declares the expected values here and verifies each independently.
    const { problems: statusProblems, report: statusReport } = await checkStatusValuesLive(client);
    if (statusProblems.length > 0) {
      console.error(`${LABEL}: FAIL — ${statusProblems.length} status-value mismatch(es):`);
      for (const p of statusProblems) console.error(`  - ${p}`);
      process.exit(1);
    }

    console.log(
      `${LABEL} OK — all 7 document families carry voided_at/void_reason/voided_by_user_id live; ` +
        `${zeroToleranceReport.join("; ")}; ${baselineReport.join("; ")}; single writer is ${THE_ONE_WRITER}; ` +
        `status values: ${statusReport.join("; ")}.`
    );
    process.exit(0);
  } finally {
    client.release();
    await pool.end().catch(() => {});
  }
}

async function selftest() {
  const target = path.join(ROOT, "apps/backend/src/accounting/invoices.routes.ts");
  const original = fs.readFileSync(target, "utf8");
  const planted = original + `\n// SELFTEST PLANT: UPDATE accounting.invoices SET voided_at = now() WHERE id = $1;\n`;
  fs.writeFileSync(target, planted);
  try {
    const loadsTargetRel = "apps/backend/src/mdata/loads-create-status.ts";
    const loadsTarget = path.join(ROOT, loadsTargetRel);
    const loadsOriginal = fs.readFileSync(loadsTarget, "utf8");
    fs.writeFileSync(loadsTarget, loadsOriginal + `\n// SELFTEST PLANT: UPDATE mdata.loads SET voided_at = now() WHERE id = $1;\n`);
    try {
      const files2 = walk(BACKEND_SRC);
      const loadsWriters = findWriters(files2, "mdata", "loads");
      if (!loadsWriters.includes(loadsTargetRel)) {
        console.error(`${LABEL} --selftest FAILED: detector did not catch a planted zero-tolerance violation.`);
        process.exit(1);
      }
      console.log(`${LABEL} --selftest OK — detector caught a planted violation on a zero-tolerance table.`);
    } finally {
      fs.writeFileSync(loadsTarget, loadsOriginal);
    }
  } finally {
    fs.writeFileSync(target, original);
  }

  // ROUND 122 ADDITION: the status-value acceptance check is DB-independent and pure
  // (evaluateStatusValueAcceptance), so it is unit-tested directly here -- no live connection
  // needed to prove the LOGIC is correct; checkStatusValuesLive's own live queries feed it real
  // data when the guard actually runs. Red-before-green per the Lead's own instruction: plant the
  // exact P0 bug's shape (invoice declared 'voided', live constraint only accepts 'void') first
  // and confirm the check catches it, THEN confirm the real, fixed value passes.
  const plantedInvoiceViolation = evaluateStatusValueAcceptance("voided", ["draft", "proforma", "sent", "partial", "paid", "void", "factored"]);
  if (plantedInvoiceViolation.ok) {
    console.error(`${LABEL} --selftest FAILED: planting 'voided' on invoice's real accepted-value set did not fail (red-before-green did not go red).`);
    process.exit(1);
  }
  const fixedInvoiceValue = evaluateStatusValueAcceptance("void", ["draft", "proforma", "sent", "partial", "paid", "void", "factored"]);
  if (!fixedInvoiceValue.ok) {
    console.error(`${LABEL} --selftest FAILED: the real, fixed invoice value 'void' was rejected (${fixedInvoiceValue.detail}).`);
    process.exit(1);
  }
  const noStatusColumnCase = evaluateStatusValueAcceptance("voided", null);
  if (noStatusColumnCase.ok) {
    console.error(`${LABEL} --selftest FAILED: declaring a value against a family with no status column at all should never pass.`);
    process.exit(1);
  }
  const noFlipDeclaredCase = evaluateStatusValueAcceptance(null, null);
  if (!noFlipDeclaredCase.ok) {
    console.error(`${LABEL} --selftest FAILED: a family that declares no status flip at all (journal_entry/fuel_transaction) must always be ok.`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK — status-value acceptance check: red-before-green confirmed (planted 'voided' on invoice's real constraint FAILS), the real fixed value 'void' PASSES, no-column and no-flip edge cases both correct.`);

  process.exit(0);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  main();
}
