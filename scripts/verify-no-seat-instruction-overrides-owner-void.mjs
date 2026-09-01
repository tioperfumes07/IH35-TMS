#!/usr/bin/env node
// verify:no-seat-instruction-overrides-owner-void
// Owner law (2026-09-01, "NO SEAT-CREATED FINANCIAL RECORDS IN PRODUCTION"): a coding seat left
// instructions in the MEMO FIELD OF THE OWNER'S OWN LEDGER telling him not to void his own record
// ("do not void", "KEEP TEST, do not delete") — a seat overriding the owner inside his own books.
// The owner named this explicitly as the worst incident and said it does not happen again.
//
// SCOPE, deliberately narrow and honest about it: the owner also said "text matching is not a
// control" — a bare search for "TEST" is proven unreliable (three REAL records matched "TEST" as
// a substring tonight: "ID DOT EST", "WHITESTOWN", a genuine $1.00 embezzlement-evidence Zelle).
// This guard does NOT attempt that. It targets one specific, narrow, well-defined pattern instead:
// a financial record's own memo/description/notes field containing an explicit INSTRUCTION aimed
// at whoever reviews the ledger — "do not void", "don't void", "keep test", "do not delete" and
// close variants — regardless of is_sample_data or any other flag. A seat writing an instruction
// TO THE OWNER inside a field he reads as his own bookkeeping is the defect, independent of
// whether the underlying record is real or test data, voided or not.
//
// This is a LIVE-DATA check — it cannot run as a static pre-commit guard (financial records are
// created by the running application via live Chrome, not by a git commit). It requires
// DATABASE_URL pointed at a READ-ONLY prod role (matching the established pattern in
// .github/workflows/prod-postdeploy-verify.yml's PROD_READONLY_DATABASE_URL secret — never a
// writable credential in CI). Without one, this cleanly SKIPS rather than failing closed on an
// absent capability, matching this repo's own SKIP-CAPABILITY convention.
//
// NOT BUILT THIS PASS (see REMAINING at the bottom, print it honestly): a full cross-reference
// against an owner-ordered walk manifest registry to catch every seat-created record that outlived
// its session, voided or not — that needs a structured, machine-readable manifest format that does
// not exist yet (today's walk manifests are prose docs: docs/bus/PICK-10-VOID-RECREATE-2026-09-01.md,
// docs/bus/RULING-VOID-10-SUBSTITUTE-PICKLIST-2026-09-01.md). This guard is the narrowest,
// highest-confidence slice of the ask that is buildable and verifiable today.
import { Client } from "pg";

const LABEL = "verify-no-seat-instruction-overrides-owner-void";

// Deliberately narrow: an IMPERATIVE instruction, not a description. "do not void" / "don't void"
// / "keep test[,]? do not delete" and close punctuation/casing variants. Does NOT match "voided",
// "test", "sample" as bare words — only the instruction shape the incident itself named.
const INSTRUCTION_PATTERNS = [
  /\bdo\s*not\s*void\b/i,
  /\bdon'?t\s*void\b/i,
  /\bkeep\s*test\b.{0,20}\bdo\s*not\s*delete\b/i,
  /\bdo\s*not\s*delete\b.{0,20}\btest\b/i,
  /\bnever\s*void\s*this\b/i,
  /\bplease\s*do\s*not\s*(void|delete)\b/i,
];

/** @param {string | null | undefined} text */
export function findInstructionOverride(text) {
  if (!text) return null;
  for (const re of INSTRUCTION_PATTERNS) {
    const m = re.exec(text);
    if (m) return m[0];
  }
  return null;
}

// One [table, text-column(s), id/label columns] entry per money type this pass covers. Every
// column named here was confirmed live against the real schema (information_schema.columns,
// tiny-field-89581227) this same session — not guessed. driver_settlements has no free-text
// memo/notes column at all; its own reason fields (void_reason/reversal_reason) are checked
// instead, which are an equally plausible place for this exact instruction shape to appear.
const SOURCES = [
  { table: "accounting.invoices", textCols: ["customer_notes", "internal_notes"], idCol: "id", labelCol: "display_id" },
  { table: "accounting.bills", textCols: ["memo"], idCol: "id", labelCol: "bill_number" },
  { table: "accounting.expenses", textCols: ["memo"], idCol: "id", labelCol: "expense_number" },
  { table: "accounting.payments", textCols: ["notes"], idCol: "id", labelCol: "id" },
  { table: "driver_finance.driver_settlements", textCols: ["void_reason", "reversal_reason"], idCol: "id", labelCol: "display_id" },
  { table: "driver_finance.driver_bills", textCols: ["notes"], idCol: "id", labelCol: "display_id" },
];

async function auditLive(databaseUrl) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const findings = [];
  try {
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    for (const src of SOURCES) {
      for (const col of src.textCols) {
        // Column existence varies by table/version — probe defensively, skip a column that
        // doesn't exist on this schema rather than failing the whole audit.
        let exists = true;
        try {
          await client.query(`SELECT ${col} FROM ${src.table} LIMIT 0`);
        } catch {
          exists = false;
        }
        if (!exists) continue;
        const res = await client.query(
          `SELECT ${src.idCol} AS id, ${src.labelCol} AS label, ${col} AS text FROM ${src.table} WHERE ${col} IS NOT NULL`
        );
        for (const row of res.rows) {
          const match = findInstructionOverride(row.text);
          if (match) {
            findings.push({ table: src.table, column: col, id: row.id, label: row.label, match, text: row.text });
          }
        }
      }
    }
  } finally {
    await client.end();
  }
  return findings;
}

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(`${LABEL} SKIP — no DATABASE_URL (this is a live-prod-only audit, read-only role required)`);
    return;
  }
  const findings = await auditLive(databaseUrl);
  if (findings.length > 0) {
    console.error(`${LABEL} FAIL — ${findings.length} record(s) carry a seat instruction overriding owner void authority:`);
    for (const f of findings) {
      console.error(`  ✗ ${f.table}.${f.id} (${f.label}) — "${f.match}" in ${f.column}: ${f.text.slice(0, 160)}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`${LABEL} PASS — 0 records across ${SOURCES.length} money-type sources carry a void/delete override instruction`);
}

function selftest() {
  const assert = { ok: (c, m) => { if (!c) throw new Error(m); } };

  assert.ok(findInstructionOverride('TEST-VOID-LATER — do not void, still needed for proof') != null,
    "must catch a plain 'do not void' instruction");
  assert.ok(findInstructionOverride("don't void this one, still checking") != null,
    "must catch the contraction form");
  assert.ok(findInstructionOverride("KEEP TEST, do not delete") != null,
    "must catch the exact live incident phrasing");
  assert.ok(findInstructionOverride("Please do not void — evidence for audit") != null,
    "must catch the polite-imperative form");

  // The exact false-positive traps the owner named must NOT be caught by this narrow pattern —
  // proving this guard does not fall into the "text matching is not a control" trap.
  assert.ok(findInstructionOverride("ID DOT EST inspection fee") == null,
    "must NOT flag a real record whose text happens to contain the substring EST");
  assert.ok(findInstructionOverride("WHITESTOWN toll") == null,
    "must NOT flag a real record whose text happens to contain the substring TEST");
  assert.ok(findInstructionOverride("Zelle payment, evidence in embezzlement matter") == null,
    "must NOT flag a genuine real record with no instruction in it");
  assert.ok(findInstructionOverride("TEST CODEX ONBOARD 20260824 — sample driver, is_sample_data=true") == null,
    "an ordinary, honestly-flagged test fixture with no override instruction must NOT be flagged — " +
    "this guard targets the instruction, not test data existing at all");
  assert.ok(findInstructionOverride(null) == null, "null text must not throw or match");
  assert.ok(findInstructionOverride("") == null, "empty text must not match");

  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  await run();
}
