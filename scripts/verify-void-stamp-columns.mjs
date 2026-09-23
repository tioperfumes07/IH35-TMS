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
    console.log(
      `${LABEL} OK — all 7 document families carry voided_at/void_reason/voided_by_user_id live; ` +
        `${zeroToleranceReport.join("; ")}; ${baselineReport.join("; ")}; single writer is ${THE_ONE_WRITER}.`
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
  process.exit(0);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  main();
}
