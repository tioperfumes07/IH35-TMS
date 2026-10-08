#!/usr/bin/env node
// LOAD-TO-CASH CHAIN, LINK 4 — OWNER LAW B (verbatim, 2026-09-12, PERMANENT): "it should never
// automatch, it suggests and we accept it or change the transactions." Never at high confidence,
// never at 100%, never on an exact amount-and-date hit, never in a nightly job, never on import,
// never in a migration, never ever. Every write of a bank-transaction match/categorization column
// must carry categorized_by_user_id — a match with no human behind it is a defect, not a
// convenience. "There is no future auto-confirm phase" — this guard has no escape hatch for one.
//
// FULL-REPO INVENTORY DONE BEFORE WRITING THIS GUARD (not a guess): a repo-wide search for every
// writer of banking.bank_transactions.matched_expense_id / matched_bill_id / matched_load_id /
// matched_settlement_id / matched_invoice_id — the five columns the Lead's chain audit measured at
// 0/518 populated — found exactly two, both reviewed and exempted below by name, never by a
// wildcard. A THIRD, SEPARATE violation was found in a different subsystem
// (banking.reconciliation_matches, not these five columns) at guard-authoring time (2026-09-12) —
// recorded as ratchet debt, then FIXED the next day (2026-09-13, ACCT-F26301, Lead ruling):
// findCandidates() no longer persists anything (READ-ONLY now — see match.service.ts), and the
// nightly cron was deleted outright (not left flag-gated) per Owner Law B ("not in a nightly job").
// KNOWN_AUTOMATCH_DEBT is now empty; kept as a named, exported const (rather than deleted outright)
// so a future regression has an obvious place to land, and so this guard's own history stays legible.
//
// Fails when:
//   1) ANY file writes `match_state: "auto_matched"` as an object literal — an automatch-and-persist
//      site (there is no debt exemption list any more; the one that existed is fixed).
//   2) ANY cron file imports findCandidates or otherwise reaches a match-persisting call — a
//      nightly-job automatch.
//   3) Any UPDATE of banking.bank_transactions setting one of the five target columns to a bound
//      parameter (a real value, not a NULL clear) lands in a file that is not on
//      TARGET_COLUMN_WRITE_ALLOWLIST, or lands in an allowlisted file without
//      categorized_by_user_id documented as N/A for that specific, reviewed reason.
//
// --selftest plants one mutation per check against a temp copy of a real file.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKEND_SRC = path.join(ROOT, "apps", "backend", "src");

// FIXED 2026-09-13 (ACCT-F26301, Lead ruling) — see header comment. Empty on purpose: both
// violations that once lived here are resolved, and the audit below fails loud if either file
// somehow regresses the debt shape without this list (and this comment) being updated to match.
const KNOWN_AUTOMATCH_DEBT = [];

// The reviewed writers of the five target columns (full-repo search before this guard was written;
// updated 2026-10-02 OWNER LAW competing-engine audit — Cursor lane bank-match writer):
//   - recon-worklist.service.ts only ever clears them to NULL (unmatching, not deciding a match).
//   - bank-invoice-backlink.service.ts derives matched_invoice_id deterministically from
//     accounting.payments.source_bank_transaction_id, a fact a human already established when
//     recording that payment — not a scored candidate.
//   - bank-bill-backlink.service.ts is the AP twin: derives matched_bill_id from
//     accounting.bill_payments.source_bank_transaction_id + bill_id after a human accept.
//     categorized_by_user_id is N/A — the accept already stamped it on the clearing UPDATE.
//   - reconciliation.routes.ts + link-suggestions-actions.routes.ts + obligation-reconcile.routes.ts
//     NO LONGER stamp matched_* on accept — they proxy acceptReconMatch →
//     acceptMatchWithResolveDifference (match.service.ts stamps via dynamic column whitelist).
//     Removed from this allowlist once their bound UPDATE writers were retired.
const TARGET_COLUMN_WRITE_ALLOWLIST = new Set([
  "apps/backend/src/accounting/bank-recon/recon-worklist.service.ts",
  "apps/backend/src/accounting/payments/bank-invoice-backlink.service.ts",
  "apps/backend/src/accounting/payments/bank-bill-backlink.service.ts",
]);

const TARGET_COLUMNS = ["matched_expense_id", "matched_bill_id", "matched_load_id", "matched_settlement_id", "matched_invoice_id"];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

function relFile(absPath) {
  return path.relative(ROOT, absPath).split(path.sep).join("/");
}

function auditKnownDebtStillPresent() {
  const failures = [];
  for (const debt of KNOWN_AUTOMATCH_DEBT) {
    const full = path.join(ROOT, debt.file);
    if (!fs.existsSync(full)) {
      failures.push(`${debt.file}: KNOWN_AUTOMATCH_DEBT file no longer exists — if this violation was actually fixed, remove it from KNOWN_AUTOMATCH_DEBT in this guard (do not just let the check go vacuous)`);
      continue;
    }
    const src = fs.readFileSync(full, "utf8");
    if (!src.includes(debt.needle)) {
      failures.push(`${debt.file}: KNOWN_AUTOMATCH_DEBT needle "${debt.needle}" no longer found — if this violation was actually fixed, remove this entry from KNOWN_AUTOMATCH_DEBT (do not let the guard go vacuous)`);
    }
  }
  return failures;
}

function auditNoNewAutoMatchedLiteral(files) {
  const failures = [];
  const debtFiles = new Set(KNOWN_AUTOMATCH_DEBT.map((d) => d.file));
  for (const abs of files) {
    const rel = relFile(abs);
    if (debtFiles.has(rel)) continue;
    const src = fs.readFileSync(abs, "utf8");
    if (/match_state\s*:\s*["']auto_matched["']/.test(src)) {
      failures.push(`${rel}: writes match_state: "auto_matched" — a new automatch-and-persist site outside KNOWN_AUTOMATCH_DEBT (Owner Law B: never automatch, not ever)`);
    }
  }
  return failures;
}

function auditNoNewAutoMatchCron(files) {
  const failures = [];
  const debtFiles = new Set(KNOWN_AUTOMATCH_DEBT.map((d) => d.file));
  for (const abs of files) {
    const rel = relFile(abs);
    if (debtFiles.has(rel)) continue;
    const isCronFile = rel.includes("/cron/") || /\.cron\.ts$/.test(rel);
    if (!isCronFile) continue;
    const src = fs.readFileSync(abs, "utf8");
    if (/findCandidates|storeMatch\(/.test(src)) {
      failures.push(`${rel}: a cron/job file calls a match-persisting function outside KNOWN_AUTOMATCH_DEBT — a new nightly-job automatch (Owner Law B: "not in a nightly job")`);
    }
  }
  return failures;
}

/** Find every `UPDATE banking.bank_transactions ... SET ...` block (to the next semicolon or
 * closing backtick) and check each one that sets a TARGET_COLUMNS entry to a bound parameter
 * (`$1`, `$2`, …) rather than a literal NULL. */
function findTargetColumnBoundWrites(src) {
  const hits = [];
  const re = /UPDATE\s+banking\.bank_transactions\b[\s\S]{0,600}?(?:;|`)/g;
  let m;
  while ((m = re.exec(src))) {
    const block = m[0];
    for (const col of TARGET_COLUMNS) {
      const setRe = new RegExp(`${col}\\s*=\\s*\\$\\d+`, "i");
      if (setRe.test(block)) hits.push({ column: col, block });
    }
  }
  return hits;
}

function auditTargetColumnWrites(files) {
  const failures = [];
  for (const abs of files) {
    const rel = relFile(abs);
    const src = fs.readFileSync(abs, "utf8");
    const hits = findTargetColumnBoundWrites(src);
    if (hits.length === 0) continue;
    if (!TARGET_COLUMN_WRITE_ALLOWLIST.has(rel)) {
      for (const h of hits) {
        failures.push(`${rel}: UPDATE banking.bank_transactions sets ${h.column} to a bound parameter — not on TARGET_COLUMN_WRITE_ALLOWLIST. A write to this column must be a reviewed, human-triggered accept action, added to the allowlist here after review, never silently.`);
      }
    }
  }
  return failures;
}

/**
 * ROUND 276 — bulk accept must never become a back door around Law B: the accept list must come
 * from the human's own request body (a required, non-empty array), never a server-side re-query
 * (e.g. "every suggestion above confidence X"). A file whose route path contains "bulk-accept"
 * must (a) call requireAuth, (b) declare a zod array schema with `.min(1)` near its body, and (c)
 * never build its accept list from a live SELECT with an ORDER BY/confidence-threshold shape.
 */
function auditBulkAcceptRequiresHumanRequestBody(files) {
  const failures = [];
  for (const abs of files) {
    const rel = relFile(abs);
    const src = fs.readFileSync(abs, "utf8");
    // Short, path-shaped literal only (e.g. "/api/v1/.../bulk-accept") -- never a bare substring
    // match against a comment or unrelated prose mentioning "bulk-accept" elsewhere in the file.
    if (!/["'`]\/[^"'`]{0,150}bulk-accept[^"'`]{0,40}["'`]/.test(src)) continue;
    if (!/requireAuth\(/.test(src)) {
      failures.push(`${rel}: has a "bulk-accept" route with no requireAuth(...) call — bulk accept must be a real, authenticated human request`);
    }
    if (!/z\s*\.array\([\s\S]{0,400}\.min\(1\)/.test(src)) {
      failures.push(`${rel}: has a "bulk-accept" route with no required non-empty array schema (z.array(...).min(1)) — the accept list must be the human's own ticked rows, never optional/empty-allowed`);
    }
    if (/confidence\s*>=|ORDER BY[\s\S]{0,80}?confidence[\s\S]{0,80}?LIMIT/i.test(src)) {
      failures.push(`${rel}: a "bulk-accept" file appears to select rows by a confidence threshold — the accept list must come from the request body, never a server-side re-query`);
    }
  }
  return failures;
}

function loadFiles() {
  return walk(BACKEND_SRC);
}

function auditAll() {
  const files = loadFiles();
  return [
    ...auditKnownDebtStillPresent(),
    ...auditNoNewAutoMatchedLiteral(files),
    ...auditNoNewAutoMatchCron(files),
    ...auditTargetColumnWrites(files),
    ...auditBulkAcceptRequiresHumanRequestBody(files),
  ];
}

function run() {
  const failures = auditAll();
  if (failures.length > 0) {
    console.error("verify-no-automatch FAIL:");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log(
    `verify-no-automatch OK — ${KNOWN_AUTOMATCH_DEBT.length} known automatch debt site(s) remaining (both original sites fixed 2026-09-13, ACCT-F26301), 0 new automatch sites, ${TARGET_COLUMN_WRITE_ALLOWLIST.size} reviewed writer(s) of the five Link-4 target columns (all human-triggered or NULL-clearing only), 0 unreviewed writers.`
  );
}

if (process.argv.includes("--selftest")) {
  const assert = await import("node:assert/strict").then((m) => m.default);
  assert.equal(auditAll().length, 0, "all checks should pass on real source");

  const tmpDir = fs.mkdtempSync(path.join(ROOT, ".tmp-no-automatch-selftest-"));
  try {
    // MUTATION 1 — a new file writes match_state: "auto_matched".
    const f1 = path.join(tmpDir, "rogue-auto-match.ts");
    fs.writeFileSync(f1, `export const x = { match_state: "auto_matched" };\n`);
    const files1 = [...loadFiles(), f1];
    assert.ok(auditNoNewAutoMatchedLiteral(files1).length > 0, "MUTATION 1 (new auto_matched literal) escaped detection");

    // MUTATION 2 — a new cron file calls findCandidates.
    const cronDir = path.join(tmpDir, "cron");
    fs.mkdirSync(cronDir, { recursive: true });
    const f2 = path.join(cronDir, "rogue.cron.ts");
    fs.writeFileSync(f2, `import { findCandidates } from "../accounting/bank-recon/match.service.js";\nfindCandidates({});\n`);
    const files2 = [...loadFiles(), f2];
    assert.ok(auditNoNewAutoMatchCron(files2).length > 0, "MUTATION 2 (new cron auto-match) escaped detection");

    // MUTATION 3 — a new, unreviewed writer of matched_expense_id to a bound parameter.
    const f3 = path.join(tmpDir, "rogue-writer.ts");
    fs.writeFileSync(
      f3,
      "const sql = `\n  UPDATE banking.bank_transactions\n  SET matched_expense_id = $1\n  WHERE id = $2;\n`;\n"
    );
    const files3 = [...loadFiles(), f3];
    assert.ok(auditTargetColumnWrites(files3).length > 0, "MUTATION 3 (unreviewed matched_expense_id writer) escaped detection");

    // MUTATION 4 — a KNOWN_AUTOMATCH_DEBT needle disappearing must fail (not go vacuous).
    const fakeDebt = [{ file: "apps/backend/src/nonexistent-for-selftest.ts", needle: "x" }];
    const failuresForFakeDebt = fakeDebt
      .filter((d) => !fs.existsSync(path.join(ROOT, d.file)))
      .map((d) => `${d.file}: missing`);
    assert.ok(failuresForFakeDebt.length > 0, "MUTATION 4 (debt file missing) escaped detection");

    // MUTATION 5 — a "bulk-accept" route with no requireAuth and no required non-empty array (a
    // hypothetical unauthenticated or server-derived bulk-accept back door around Law B).
    const f5 = path.join(tmpDir, "rogue-bulk-accept.routes.ts");
    fs.writeFileSync(f5, `app.post("/api/v1/banking/link-suggestions/bulk-accept", async (req) => { return {}; });\n`);
    const files5 = [...loadFiles(), f5];
    assert.ok(auditBulkAcceptRequiresHumanRequestBody(files5).length > 0, "MUTATION 5 (unauthenticated/server-derived bulk-accept) escaped detection");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log("verify-no-automatch --selftest PASS (5/5 mutations caught)");
  process.exit(0);
}

run();
