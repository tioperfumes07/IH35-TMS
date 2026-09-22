#!/usr/bin/env node
// verify-reconciliation-constants.mjs — the USMCA/Faro reconciliation, CLOSED (owner order,
// 2026-09-22): "SAVED SO NOBODY ASKS AGAIN." Nine figures are LAW.
// docs/manuals/00-USMCA-RECONCILIATION-CLOSED-NEVER-ASK-AGAIN.md is the human-readable record;
// data/reconciliation/usmca-reconciliation-closed-2026-09-22.json is the machine-readable one.
// This guard is the enforcement: it hardcodes the nine LAW values (so a silent edit to the JSON
// alone cannot change what "correct" means — this file's own diff has to move too, and a reviewer
// sees it), asserts the JSON matches them exactly, asserts the arithmetic identity holds, and
// cross-checks the same nine numbers are printed, unchanged, in the markdown doc.
//
// cash_reserve_at_0921 CORRECTION (2026-09-22, same day, caught by Cursor): the Lead's first pass
// framed this as ONE number. It is genuinely FOUR numbers — before a same-day deposit, Faro's own
// statement ending balance, after a same-day sweep to IH35, and a later 9/22 balance after a
// separate release. Only ONE of the four is LAW here: Faro's own statement ending balance
// ($4,135.41) — the CONTROL figure, matched against ACCOUNT SUMMARY.csv's own ending column. The
// other three are real, sourced, informational movements and are never asserted by this guard.
//
// Static — no DB, no network. Runs on every push.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-reconciliation-constants";
const JSON_PATH = path.join(ROOT, "data/reconciliation/usmca-reconciliation-closed-2026-09-22.json");
const DOC_PATH = path.join(ROOT, "docs/manuals/00-USMCA-RECONCILIATION-CLOSED-NEVER-ASK-AGAIN.md");

// THE LAW — owner order, 2026-09-22. Do not edit without a new owner order naming the change.
const LAW = {
  purchases_cents: 31158700,
  ar_cents: 29876200,
  receipts_cents: 1282500,
  discount_fee_cents: 467382,
  wire_fee_cents: 22000,
  schedule_fee_cents: 822,
  escrow_at_0921_cents: 453019,
  cash_reserve_at_0921_cents: 413541, // Faro statement ending balance, THE CONTROL — not one of the other 3 real movement figures
  realized_fees_cents: 490204,
  self_carried_open_cents: 1259240,
};

const dollars = (c) => (c / 100).toFixed(2);

/** Pure comparison — no I/O — so --selftest can exercise it with synthetic data. */
export function checkAgainstLaw(candidate) {
  const problems = [];
  for (const [key, expected] of Object.entries(LAW)) {
    const actual = candidate[key];
    if (actual !== expected) {
      problems.push(`${key}: expected ${expected} ($${dollars(expected)}), got ${actual === undefined ? "MISSING" : `${actual} ($${dollars(actual)})`}`);
    }
  }
  return problems;
}

export function checkIdentity(candidate) {
  const lhs = (candidate.purchases_cents ?? 0) - (candidate.receipts_cents ?? 0);
  const rhs = candidate.ar_cents ?? 0;
  return lhs === rhs ? null : `identity failed: purchases - receipts (${lhs}) != ar (${rhs})`;
}

/** Extract the same nine figures from the markdown doc's own printed table, by label. Anchors on
 * the label text, not line position, so reformatting the table doesn't silently stop checking. */
function extractFromDoc(text) {
  const patterns = {
    purchases_cents: /purchases\D+([\d,]+\.\d{2})/i,
    ar_cents: /\bAR\D+([\d,]+\.\d{2})/i,
    receipts_cents: /receipts\D+([\d,]+\.\d{2})/i,
    discount_fee_cents: /discount fee\D+([\d,]+\.\d{2})/i,
    wire_fee_cents: /wire fee\D+([\d,]+\.\d{2})/i,
    schedule_fee_cents: /schedule fee\D+([\d,]+\.\d{2})/i,
    escrow_at_0921_cents: /escrow @ ?9\/21\D+([\d,]+\.\d{2})/i,
    // Anchored on "THE CONTROL" so the doc's other 3 informational cash-reserve figures (before
    // deposit / after sweep / 9/22 after release) can never be accidentally matched here.
    cash_reserve_at_0921_cents: /cash reserve @ ?9\/21[^\n]*THE CONTROL\D+([\d,]+\.\d{2})/i,
    realized_fees_cents: /realized fees\D+([\d,]+\.\d{2})/i,
    self_carried_open_cents: /self-carried open\D+([\d,]+\.\d{2})/i,
  };
  const out = {};
  for (const [key, re] of Object.entries(patterns)) {
    const m = text.match(re);
    if (m) out[key] = Math.round(Number(m[1].replace(/,/g, "")) * 100);
  }
  return out;
}

function main() {
  if (process.argv.includes("--selftest")) {
    const good = { ...LAW };
    const bad = { ...LAW, purchases_cents: LAW.purchases_cents + 100 };
    const missing = { ...LAW };
    delete missing.ar_cents;

    const goodProblems = checkAgainstLaw(good);
    const badProblems = checkAgainstLaw(bad);
    const missingProblems = checkAgainstLaw(missing);
    const goodIdentity = checkIdentity(good);
    const badIdentity = checkIdentity({ purchases_cents: 100, receipts_cents: 1, ar_cents: 50 });

    let caught = 0;
    const total = 5;
    if (goodProblems.length === 0) caught++;
    else console.error(`${LABEL}: SELFTEST FAIL — unmutated LAW should have 0 problems, got ${goodProblems.length}`);
    if (badProblems.length === 1 && /purchases_cents/.test(badProblems[0])) caught++;
    else console.error(`${LABEL}: SELFTEST FAIL — planted +100 cent mutation on purchases_cents was not caught`);
    if (missingProblems.length === 1 && /ar_cents/.test(missingProblems[0]) && /MISSING/.test(missingProblems[0])) caught++;
    else console.error(`${LABEL}: SELFTEST FAIL — planted missing-field mutation was not caught`);
    if (goodIdentity === null) caught++;
    else console.error(`${LABEL}: SELFTEST FAIL — real identity should hold`);
    if (badIdentity !== null) caught++;
    else console.error(`${LABEL}: SELFTEST FAIL — planted broken identity (100-1!=50) was not caught`);

    if (caught !== total) {
      console.error(`${LABEL}: SELFTEST FAILED ${caught}/${total}`);
      process.exit(1);
    }
    console.log(`${LABEL}: SELFTEST caught ${caught}/${total} planted mutation(s) — the comparison logic itself, no file I/O required.`);
    return;
  }

  const failures = [];

  if (!fs.existsSync(JSON_PATH)) {
    console.error(`${LABEL}: FAIL — ${path.relative(ROOT, JSON_PATH)} does not exist. The reconciliation record must exist.`);
    process.exit(1);
  }
  const json = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
  const jsonProblems = checkAgainstLaw(json);
  if (jsonProblems.length) {
    failures.push(`${path.relative(ROOT, JSON_PATH)} contradicts the LAW:\n  ${jsonProblems.join("\n  ")}`);
  }
  const jsonIdentity = checkIdentity(json);
  if (jsonIdentity) failures.push(`${path.relative(ROOT, JSON_PATH)}: ${jsonIdentity}`);

  if (!fs.existsSync(DOC_PATH)) {
    console.error(`${LABEL}: FAIL — ${path.relative(ROOT, DOC_PATH)} does not exist. The human-readable record must exist.`);
    process.exit(1);
  }
  const docText = fs.readFileSync(DOC_PATH, "utf8");
  const docValues = extractFromDoc(docText);
  const missingInDoc = Object.keys(LAW).filter((k) => !(k in docValues));
  if (missingInDoc.length) {
    failures.push(`${path.relative(ROOT, DOC_PATH)} is missing printed figures for: ${missingInDoc.join(", ")} (the guard could not find them by label — reformatting the doc must keep every label matchable)`);
  }
  const docProblems = checkAgainstLaw(docValues);
  if (docProblems.length) {
    failures.push(`${path.relative(ROOT, DOC_PATH)} contradicts the LAW:\n  ${docProblems.join("\n  ")}`);
  }

  if (failures.length) {
    console.error(`${LABEL}: FAIL —\n${failures.join("\n\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — ${path.relative(ROOT, JSON_PATH)} and ${path.relative(ROOT, DOC_PATH)} both match the owner-ordered LAW exactly, identity holds ($${dollars(LAW.purchases_cents)} - $${dollars(LAW.receipts_cents)} = $${dollars(LAW.ar_cents)}).`);
}

main();
