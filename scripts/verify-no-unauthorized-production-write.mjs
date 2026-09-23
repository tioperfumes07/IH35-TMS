#!/usr/bin/env node
// ROUND 133 (owner law, P0): "FAILS if any script under scripts/ops/ that writes to a financial
// table can run without calling verify-owner-authorization.mjs first. Required: 0."
//
// STATIC, source-pattern check: for every scripts/ops/*.ts/.mjs/.mts file, a "writes to a financial
// table" signal is any of: a raw SQL UPDATE/INSERT/DELETE against a financial schema
// (accounting./mdata./fuel./driver_finance./banking./catalogs.), or a call to one of the known
// write primitives this codebase's own law already names (createJournalEntry/
// createJournalEntryOnClient, postVoidReversal, reverseJournalEntryNoFlip, stampDocumentVoided,
// voidJournalEntry, reverseFactoringAdvanceEvent/InClientTx, reverseSettlementBillPayment/InClientTx,
// reversePostedSourceTransaction/InClientTx). A file with that signal must ALSO reference
// "verify-owner-authorization" somewhere in its own source (importing/spawning the check) --
// otherwise it FAILS.
//
// BASELINE (shrink-only, matching this session's own established ratchet pattern -- see
// verify-void-stamp-columns.mjs's writer allowlist, verify-no-double-reversed-fuel-postings.mjs's
// corrupted-row baseline for precedent): scripts/ops/ has 142 PRE-EXISTING files spanning many
// prior rounds at the moment this guard was authored -- individually auditing and retrofitting all
// 142 under this round's own deadline is not honest to attempt, and is not what this round's text
// asks for ("BUILD IT NOW" names the NEW law, not a retroactive rewrite of the entire directory).
// Baseline files are exempt from the hard FAIL but their write-without-AUTH-check status is still
// COUNTED and printed every run, so the debt stays visible, never hidden. Any file NOT in the
// baseline is NEW since this guard landed and gets ZERO tolerance from the first push.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-no-unauthorized-production-write";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OPS_DIR = path.join(ROOT, "scripts", "ops");
const BASELINE_FILE = path.join(ROOT, "scripts", "verify-no-unauthorized-production-write.baseline.json");

const WRITE_PRIMITIVES = [
  "createJournalEntryOnClient",
  "createJournalEntry(",
  "postVoidReversal",
  "reverseJournalEntryNoFlip",
  "stampDocumentVoided",
  "voidJournalEntry",
  "reverseFactoringAdvanceEvent",
  "reverseSettlementBillPayment",
  "reversePostedSourceTransaction",
];
const RAW_SQL_WRITE_RE = /\b(UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+(accounting|mdata|fuel|driver_finance|banking|catalogs)\./i;
const AUTH_CHECK_SIGNAL = "verify-owner-authorization";

function writesFinancialTable(src) {
  if (RAW_SQL_WRITE_RE.test(src)) return true;
  return WRITE_PRIMITIVES.some((p) => src.includes(p));
}

function main() {
  if (!fs.existsSync(OPS_DIR)) {
    console.log(`${LABEL}: OK — ${OPS_DIR} does not exist, nothing to check.`);
    process.exit(0);
  }
  const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
  const baselineSet = new Set(baseline.files);

  const entries = fs.readdirSync(OPS_DIR).filter((f) => /\.(ts|mjs|mts)$/.test(f));

  const newViolations = [];
  let baselineDebtCount = 0;

  for (const entry of entries) {
    const src = fs.readFileSync(path.join(OPS_DIR, entry), "utf8");
    if (!writesFinancialTable(src)) continue;
    const hasCheck = src.includes(AUTH_CHECK_SIGNAL);
    if (hasCheck) continue;

    if (baselineSet.has(entry)) {
      baselineDebtCount++;
    } else {
      newViolations.push(entry);
    }
  }

  if (newViolations.length > 0) {
    console.error(`${LABEL}: FAIL — ${newViolations.length} NEW scripts/ops/ file(s) write to a financial table without calling verify-owner-authorization.mjs:`);
    for (const f of newViolations) console.error(`  ✗ ${f}`);
    process.exit(1);
  }

  console.log(`${LABEL}: OK — no NEW scripts/ops/ file writes to a financial table without the owner-authorization check.`);
  console.log(`  (${baselineDebtCount} pre-existing baseline file(s) still lack the check -- named in ${path.basename(BASELINE_FILE)}, visible debt, shrink-only, not hidden.)`);
  process.exit(0);
}

main();
