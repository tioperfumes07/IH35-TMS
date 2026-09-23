#!/usr/bin/env node
// BANK-UNDO-01 (owner, via the Lead) — QBO parity: Banking > Categorized/Excluded had no Undo,
// row or bulk. This guard proves the fix holds three ways:
//
//   LIVE ARM A  — a half-released row: categorized_at IS NULL (never categorized, or already
//                 undone) while ANY matched_*/categorization_* column is still populated. Required: 0.
//   STATIC ARM B — no write path anywhere in apps/backend/src clears matched_journal_entry_id
//                 (sets it to NULL) without that same file also calling reverseJournalEntryNoFlip —
//                 the engine that reverses the JE before the pointer may be dropped. A file clearing
//                 the pointer with no reversal call anywhere in it is an orphan-JE path.
//   STATIC ARM C — BankingTransactionsDesignView.tsx's Categorized/Excluded tabs each bind a real
//                 row action AND a real bulk action (not merely rendered — actually wired to a
//                 handler), the exact defect the owner measured ("the Action column renders empty
//                 because nothing is registered on it").
//
// `node scripts/verify-bank-undo-releases-every-match-column.mjs`              check
// `node scripts/verify-bank-undo-releases-every-match-column.mjs --selftest`   self-check, no DB
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-undo-releases-every-match-column";
const VIEW_PATH = path.join(ROOT, "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx");
const BACKEND_SRC = path.join(ROOT, "apps/backend/src");
const BASELINE_PATH = path.join(ROOT, "scripts/verify-bank-undo-releases-every-match-column.baseline.json");

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return { half_released_rows: 0 };
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
}

// Same convention every other live-Neon guard in this repo uses (see verify-alwaystrack-parity.mjs):
// skip gracefully, exit 0, when DATABASE_URL is not set.
export const REQUIRES_LIVE_DB =
  "live() fails closed without DATABASE_URL by design; the dead-port sentinel cannot ask this guard a question it can answer";

function fail(msg) {
  console.error(`${LABEL}: FAIL — ${msg}`);
  process.exit(1);
}

const HALF_RELEASED_COLUMNS = [
  "matched_load_id",
  "matched_invoice_id",
  "matched_bill_id",
  "matched_expense_id",
  "matched_payment_id",
  "matched_bill_payment_id",
  "matched_transfer_id",
  "matched_settlement_id",
  "matched_advance_id",
  "matched_journal_entry_id",
  "categorization_customer_id",
  "categorization_vendor_id",
  "categorization_gl_account_id",
  "categorization_project_id",
  "categorization_memo",
  "categorization_driver_id",
  "categorization_unit_id",
  "categorization_load_id",
  "categorization_recover_deduction_type",
  "categorization_deduction_id",
  "categorization_item_id",
  "categorization_trailer_id",
  "categorization_class_id",
  "categorization_location",
];

/** Pure — builds the half-released-row WHERE clause. Exported for --selftest. */
export function halfReleasedWhereClause() {
  const nonBoolean = HALF_RELEASED_COLUMNS.map((c) => `${c} IS NOT NULL`).join(" OR ");
  // categorization_recover_from_driver is boolean NOT NULL DEFAULT false — "cleared" is false, not NULL.
  return `categorized_at IS NULL AND (${nonBoolean} OR categorization_recover_from_driver = true)`;
}

/**
 * STATIC ARM B — pure, takes {relativePath, source} entries. A file that clears
 * matched_journal_entry_id (sets it to NULL, in a SQL string) must also reference
 * reverseJournalEntryNoFlip somewhere in the same file — the reversal engine that must run first.
 */
export function findOrphanJeClearPaths(files) {
  const CLEAR_RE = /matched_journal_entry_id\s*=\s*NULL/i;
  const violations = [];
  for (const { relativePath, source } of files) {
    if (!CLEAR_RE.test(source)) continue;
    if (source.includes("reverseJournalEntryNoFlip")) continue;
    violations.push(relativePath);
  }
  return violations;
}

/**
 * STATIC ARM C — pure, takes the view file's source text. The Categorized/Excluded tabs must each
 * have a real row-level control AND a real bulk-toolbar entry bound to a handler — not merely a
 * label with no onClick, which is the defect this guard exists to catch.
 */
export function checkTabsBindUndoActions(source) {
  const problems = [];
  if (!/function\s+isUndoEligible\s*\(/.test(source) && !/const\s+isUndoEligible\s*=/.test(source)) {
    problems.push("no isUndoEligible(tx) eligibility gate found — Categorized/Excluded rows have no way to distinguish themselves for a row action");
  }
  // Row-level: an eligibility-gated control whose onClick actually calls the undo handler.
  if (!/isUndoEligible\(tx\)[\s\S]{0,400}?onClick=\{\(\)\s*=>\s*void undoCategorization/.test(source)) {
    problems.push("row-level Action column: no control gated on isUndoEligible(tx) calling undoCategorization(...) — the Action column can render with nothing bound");
  }
  // Bulk: an "undo" entry in the bulk action bar array, bound to a real onClick (not a no-op).
  if (!/id:\s*"undo"[\s\S]{0,800}?onClick:\s*\(\)\s*=>\s*void bulkUndo\(\)/.test(source)) {
    problems.push('bulk action bar: no { id: "undo", ... onClick: () => void bulkUndo() } entry — the bulk Undo control is not wired');
  }
  return problems;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(p, out);
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) continue;
    if (/\.test\.tsx?$/.test(entry.name)) continue;
    out.push(p);
  }
  return out;
}

// ROUND 29.9-B owner ruling: a live money guard that cannot connect is a FAIL, never a pass —
// this arm reads banking.bank_transactions, money data, so it may NOT declare ALLOW_OFFLINE_SKIP.
async function live() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    // THE BYPASS TRAP (verify-alwaystrack-parity.mjs's own lesson): the bypass CTE/config call
    // must be referenced in a WHERE clause or a FORCED-RLS table silently returns 0 rows.
    const res = await client.query(
      `SELECT count(*)::int AS n FROM banking.bank_transactions
        WHERE (SELECT current_setting('app.bypass_rls', true)) = 'lucia' AND ${halfReleasedWhereClause()}`
    );
    await client.query("ROLLBACK");
    const current = Number(res.rows[0]?.n ?? 0);
    const baseline = loadBaseline();
    const allowed = Number(baseline.half_released_rows ?? 0);
    if (current > allowed) {
      fail(
        `LIVE ARM A — ${current} half-released bank_transaction row(s) (categorized_at NULL, a ` +
          `matched_*/categorization_* column still set) — WORSE than the baseline's ${allowed}. ` +
          `A new row went half-released, or the baseline needs a real fix, not a bump.`
      );
    }
    if (current > 0) {
      console.log(
        `${LABEL}: LIVE ARM A — ${current} half-released row(s), known pre-existing debt (baseline ${allowed}), not a new regression. ` +
          `Fully green (0) is still the goal — see the baseline file's note.`
      );
    }
    return true;
  } finally {
    client.release();
    await pool.end();
  }
}

function selftest() {
  const failures = [];

  // Arm A clause — sanity: it must reference every real column, and the boolean specially.
  const clause = halfReleasedWhereClause();
  for (const c of HALF_RELEASED_COLUMNS) {
    if (c === "categorization_recover_from_driver") continue;
    if (!clause.includes(`${c} IS NOT NULL`)) failures.push(`halfReleasedWhereClause() missing column ${c}`);
  }
  if (!clause.includes("categorization_recover_from_driver = true")) {
    failures.push("halfReleasedWhereClause() must treat categorization_recover_from_driver specially (NOT NULL boolean, cleared = false)");
  }

  // Arm B — a bad fixture (clears the pointer, never reverses) must be flagged; a good one must not.
  const bad = [{ relativePath: "apps/backend/src/x/bad.ts", source: `UPDATE t SET matched_journal_entry_id = NULL WHERE id = $1` }];
  const good = [
    {
      relativePath: "apps/backend/src/x/good.ts",
      source: `await reverseJournalEntryNoFlip(client, {});\nUPDATE t SET matched_journal_entry_id = NULL WHERE id = $1`,
    },
  ];
  const unrelated = [{ relativePath: "apps/backend/src/x/unrelated.ts", source: `const x = 1;` }];
  if (findOrphanJeClearPaths(bad).length !== 1) failures.push("findOrphanJeClearPaths did not flag the bad fixture");
  if (findOrphanJeClearPaths(good).length !== 0) failures.push("findOrphanJeClearPaths wrongly flagged the good fixture");
  if (findOrphanJeClearPaths(unrelated).length !== 0) failures.push("findOrphanJeClearPaths flagged a file that never clears the pointer at all — false positive");

  // Arm C — a source string missing the bindings must be flagged; the real file must not be.
  const emptySource = "export function X() { return null; }";
  const emptyProblems = checkTabsBindUndoActions(emptySource);
  if (emptyProblems.length === 0) failures.push("checkTabsBindUndoActions did not flag a file with no Undo bindings at all");

  if (!fs.existsSync(VIEW_PATH)) {
    failures.push(`selftest: ${path.relative(ROOT, VIEW_PATH)} does not exist`);
  } else {
    const realSource = fs.readFileSync(VIEW_PATH, "utf8");
    const realProblems = checkTabsBindUndoActions(realSource);
    if (realProblems.length !== 0) failures.push(`checkTabsBindUndoActions flagged the real view file: ${realProblems.join("; ")}`);
  }

  if (failures.length) {
    for (const f of failures) console.error(`${LABEL} --selftest: FAIL — ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS --selftest`);
}

async function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  // STATIC ARM B — scan every backend source file for an orphan JE-clear path.
  const backendFiles = walk(BACKEND_SRC).map((p) => ({ relativePath: path.relative(ROOT, p), source: fs.readFileSync(p, "utf8") }));
  const orphanPaths = findOrphanJeClearPaths(backendFiles);
  if (orphanPaths.length) {
    fail(
      `STATIC ARM B — ${orphanPaths.length} file(s) clear matched_journal_entry_id without ever calling ` +
        `reverseJournalEntryNoFlip in the same file:\n` + orphanPaths.map((p) => `    ${p}`).join("\n")
    );
  }

  // STATIC ARM C — the Categorized/Excluded tabs must bind real row + bulk actions.
  if (!fs.existsSync(VIEW_PATH)) fail(`${path.relative(ROOT, VIEW_PATH)} does not exist`);
  const viewProblems = checkTabsBindUndoActions(fs.readFileSync(VIEW_PATH, "utf8"));
  if (viewProblems.length) {
    fail(`STATIC ARM C — ${viewProblems.join("; ")}`);
  }

  // LIVE ARM A — real data, only when a DB is reachable (same convention as every other live guard).
  await live();

  console.log(`${LABEL}: PASS — 0 orphan JE-clear paths (${backendFiles.length} backend files scanned), Categorized/Excluded tabs bind real row + bulk Undo actions.`);
}

main().catch((err) => {
  console.error(`${LABEL}: FAIL — ${err?.stack || err}`);
  process.exit(1);
});
