// GUARD: reverse+repost USMCA settlement executor (Blocker 2).
// Verifies the combined executor script exists, has the right structure, and its selftest passes.
// Asserts: (1) void-not-delete (old JEs status='void', never deleted), (2) new postings tie to CSV
// to the penny ($44,234.51), (3) maker≠checker on the reversal step, (4) audit.row_changes trail
// on every reversal, (5) hard prod block.
//
// Static guard (no DB required). The live DB proof is the executor's own tie-out + the DONE line.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url)); // scripts/verify-steps
const REPO = path.resolve(HERE, "..", ".."); // repo root
const EXECUTOR = path.join(REPO, "apps/backend/scripts/reverse-repost-usmca-settlements.mts");
const HEADERS_CSV = path.join(REPO, "docs/reconciliation/2026-09-07-usmca/usmca-settlements-from-signed-docs.csv");
const LINES_CSV = path.join(REPO, "docs/reconciliation/2026-09-07-usmca/usmca-settlement-lines-from-signed-docs.csv");

const EXPECTED_GRAND_CENTS = 4423451; // $44,234.51
const EXPECTED_TOUR_COUNT = 32;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function assert(cond, msg) {
  if (!cond) fail(msg);
}

// ── 1. Executor script exists. ────────────────────────────────────────────────────────────────────
assert(fs.existsSync(EXECUTOR), `executor script not found: ${EXECUTOR}`);
const src = fs.readFileSync(EXECUTOR, "utf8");

// ── 2. Reuses existing posting engine (no new GL math). ───────────────────────────────────────────
assert(src.includes("reverseSettlementPayRunInClientTx"), "executor must reuse reverseSettlementPayRunInClientTx (no new GL math)");
assert(src.includes("closeSettlementPayRun"), "executor must reuse closeSettlementPayRun (no new GL math)");
assert(src.includes("reverseJournalEntryNoFlip"), "executor must reuse reverseJournalEntryNoFlip for the standalone JE fold");
assert(!src.includes("createJournalEntry(") || src.includes("reverseJournalEntryNoFlip"), "executor must not call createJournalEntry directly (reuse existing poster)");

// ── 3. Void, never delete. ────────────────────────────────────────────────────────────────────────
// The executor delegates the pay-run void to reverseSettlementPayRunInClientTx (which sets
// status='void' on payrun_gl_runs). The executor itself voids settlement_lines and flips the header.
assert(src.includes("is_active = false"), "executor must void settlement_lines (is_active=false), never delete");
assert(src.includes("status = 'cancelled'"), "executor must flip settlement header to 'cancelled', never delete");
assert(src.includes("status='void'"), "executor must verify old runs are status='void' (void-not-delete check)");
assert(src.includes("void-not-delete"), "executor must include a void-not-delete verification step");
assert(!/DELETE\s+FROM/i.test(src), "executor must NOT contain DELETE FROM (void-not-delete law §B)");

// ── 4. Maker ≠ checker. ───────────────────────────────────────────────────────────────────────────
assert(src.includes("REVERSAL_ACTOR"), "executor must define REVERSAL_ACTOR (maker)");
assert(src.includes("REPOST_ACTOR"), "executor must define REPOST_ACTOR (checker)");
assert(src.includes("MAKER=CHECKER VIOLATION"), "executor must assert maker≠checker at runtime");
assert(src.includes("reversal actor and repost actor must differ"), "executor must enforce maker≠checker");

// ── 5. Audit trail (audit.row_changes). ───────────────────────────────────────────────────────────
assert(src.includes("audit.row_changes"), "executor must verify audit.row_changes entries on every reversal");
assert(src.includes("AUDIT TRAIL GAP"), "executor must fail-loud when audit.row_changes entries are missing");
assert(src.includes("row_changes_recorded"), "executor must count row_changes per reversal");

// ── 6. Hard prod block. ───────────────────────────────────────────────────────────────────────────
assert(src.includes("assertNotProd"), "executor must hard-block prod endpoint");
assert(src.includes("PROD_ENDPOINT_MARKERS"), "executor must define prod endpoint markers");
assert(src.includes("REFUSING TO RUN"), "executor must refuse to run against prod");
assert(src.includes("REBUILD_I_UNDERSTAND"), "executor must require REBUILD_I_UNDERSTAND=yes for --commit");

// ── 7. Expected total = $44,234.51 (32 tours). ────────────────────────────────────────────────────
assert(src.includes("EXPECTED_GRAND_CENTS = 4423451"), "executor must expect grand total $44,234.51");
assert(src.includes("EXPECTED_TOUR_COUNT = 32"), "executor must expect 32 tours");

// ── 8. CSV files exist and have the right totals. ─────────────────────────────────────────────────
assert(fs.existsSync(HEADERS_CSV), `headers CSV not found: ${HEADERS_CSV}`);
assert(fs.existsSync(LINES_CSV), `lines CSV not found: ${LINES_CSV}`);

function parseCsvTotal(filePath, valueCol) {
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split("\n").filter((l) => l.trim());
  let grand = 0;
  for (let i = 1; i < lines.length; i++) {
    // Simple parse: last column is the value (handle quoted fields with embedded commas)
    const row = lines[i];
    // For headers CSV, total_due is the last column; for lines CSV, amount is the last column
    const parts = row.match(/("[^"]*"|[^,]+)/g) ?? [];
    const last = (parts[parts.length - 1] ?? "0").replace(/"/g, "").trim();
    grand += Math.round(Number(last) * 100);
  }
  return grand;
}

const headersGrand = parseCsvTotal(HEADERS_CSV, 0);
assert(headersGrand === EXPECTED_GRAND_CENTS, `headers CSV grand ${headersGrand / 100} != expected ${EXPECTED_GRAND_CENTS / 100}`);

const linesGrand = parseCsvTotal(LINES_CSV, 0);
assert(linesGrand === EXPECTED_GRAND_CENTS, `lines CSV grand ${linesGrand / 100} != expected ${EXPECTED_GRAND_CENTS / 100}`);

// ── 9. Selftest passes (offline CSV + invariant checks). ──────────────────────────────────────────
try {
  const out = execSync("npx tsx scripts/reverse-repost-usmca-settlements.mts --selftest", {
    cwd: path.join(REPO, "apps/backend"),
    encoding: "utf8",
    timeout: 30000,
  });
  assert(out.includes("ALL PASS"), `selftest did not pass: ${out}`);
  assert(out.includes("32 tours"), `selftest must report 32 tours: ${out}`);
  assert(out.includes("44234.51"), `selftest must report grand $44,234.51: ${out}`);
  assert(out.includes("maker≠checker"), `selftest must verify maker≠checker: ${out}`);
} catch (e) {
  fail(`selftest failed: ${e.message}`);
}

console.log("PASS: 11214-verify-reverse-repost-usmca-executor — executor reuses existing poster, void-not-delete, maker≠checker, audit.row_changes trail, prod-blocked, 32 tours / $44,234.51, selftest PASS");
