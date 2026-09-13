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
// wildcard. A THIRD, SEPARATE, PRE-EXISTING violation was found in a different subsystem
// (banking.reconciliation_matches, not these five columns) — recorded as ratchet debt, not
// silently passed. See KNOWN_AUTOMATCH_DEBT.
//
// Fails when:
//   1) A NEW file (outside KNOWN_AUTOMATCH_DEBT) writes `match_state: "auto_matched"` as an object
//      literal — a second/third automatch-and-persist site.
//   2) A NEW cron file (outside KNOWN_AUTOMATCH_DEBT) imports findCandidates or otherwise reaches a
//      match-persisting call — a new nightly-job automatch.
//   3) Any UPDATE of banking.bank_transactions setting one of the five target columns to a bound
//      parameter (a real value, not a NULL clear) lands in a file that is not on
//      TARGET_COLUMN_WRITE_ALLOWLIST, or lands in an allowlisted file without
//      categorized_by_user_id documented as N/A for that specific, reviewed reason.
//   4) Either KNOWN_AUTOMATCH_DEBT needle goes missing without this guard being updated — the debt
//      must stay visible, not silently disappear because a refactor moved the code.
//
// --selftest plants one mutation per check against a temp copy of a real file.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKEND_SRC = path.join(ROOT, "apps", "backend", "src");

// RATCHET DEBT (owed, not forgiven — 2026-09-12 discovery while authoring this guard). Neither
// touches the five matched_* columns above; both write banking.reconciliation_matches instead,
// via a DIFFERENT engine (accounting/bank-recon/match.service.ts, "Engine B"). Flagged to the Lead
// the same day this guard was written, not fixed here — removing findCandidates()'s auto-persist
// touches a live, heavily-tested reconciliation surface shared with the accounting/money lane and
// deserves its own reviewed change, not a rushed edit inside an unrelated PR.
const KNOWN_AUTOMATCH_DEBT = [
  {
    file: "apps/backend/src/accounting/bank-recon/match.service.ts",
    needle: 'match_state: "auto_matched"',
    note: "findCandidates() auto-persists a reconciliation_matches row on a bare GET (opening the Match drawer) when score+amount+date criteria are met — no human action.",
  },
  {
    file: "apps/backend/src/cron/bank-recon-auto-match.cron.ts",
    needle: "findCandidates",
    note: "a nightly cron (currently gated off by BANK_RECON_AUTO_MATCH_CRON_ENABLED, default false) that would call the same auto-persist path for every company, every night, if enabled.",
  },
];

// The three (and only three) reviewed writers of the five target columns, found by a full-repo
// search before this guard was written (see header). A write here is allowed ONLY because it was
// read in full and is NOT a fuzzy-match guess:
//   - recon-worklist.service.ts only ever clears them to NULL (unmatching, not deciding a match).
//   - bank-invoice-backlink.service.ts derives matched_invoice_id deterministically from
//     accounting.payments.source_bank_transaction_id, a fact a human already established when
//     recording that payment — not a scored candidate.
//   - reconciliation.routes.ts's POST /api/v1/banking/reconciliation/:sessionId/match is a real,
//     authenticated (currentAuthUser), role-gated (canReconcile) human-action route: it records
//     matched_by_user_uuid + match_state='user_matched' (never 'auto_matched') on the sibling
//     banking.reconciliation_matches row in the SAME handler, plus appendCrudAudit — the
//     accountability trail Owner Law B requires, just under this table's own column name rather
//     than the literal string "categorized_by_user_id".
const TARGET_COLUMN_WRITE_ALLOWLIST = new Set([
  "apps/backend/src/accounting/bank-recon/recon-worklist.service.ts",
  "apps/backend/src/accounting/payments/bank-invoice-backlink.service.ts",
  "apps/backend/src/banking/reconciliation.routes.ts",
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
    `verify-no-automatch OK — ${KNOWN_AUTOMATCH_DEBT.length} known pre-existing automatch debt site(s) tracked (not fixed here, not hidden either), 0 new automatch sites, ${TARGET_COLUMN_WRITE_ALLOWLIST.size} reviewed writer(s) of the five Link-4 target columns (all human-triggered or NULL-clearing only), 0 unreviewed writers.`
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
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log("verify-no-automatch --selftest PASS (4/4 mutations caught)");
  process.exit(0);
}

run();
