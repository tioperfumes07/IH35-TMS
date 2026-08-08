#!/usr/bin/env node
/**
 * DD2 / NO-WINDOW — a settlement's deduction total must include pending_ack lines.
 *
 * SettlementDetailPage summed `row.pending_ack ? 0 : row.this_period_amount`, so a deduction the ledger
 * already holds displayed as $0 — real driver money with no window over it.
 *
 * It is also the pattern §9.5 forbids: the SIGNED HIRE CONTRACT authorizes settlement deductions. There is
 * NO separate driver e-sign and NO per-expense acknowledgment gate, and `pending_acknowledgment` blocking
 * must never be built or re-added from the blueprint (those MUSTs are struck through). pending_ack is a
 * DISCLOSURE — it keeps its own subtotal and badge — not a reason to hide money from the total.
 *
 *   node scripts/verify-deduction-total-counts-pending-ack.mjs [--selftest]
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const LABEL = "verify-deduction-total-counts-pending-ack";
const PAGE = "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx";

function assert(files) {
  const problems = [];
  const src = files[PAGE] ?? "";
  if (!/const deductionTotal =/.test(src)) return [`${PAGE}: deductionTotal not found — anchor drifted`];

  if (/deductionTotal = deductions\.reduce\(\(sum, row\) => sum \+ \(row\.pending_ack \? 0 :/.test(src)) {
    problems.push(
      `${PAGE}: deductionTotal must NOT zero out pending_ack lines — that hides a real deduction the ledger ` +
        `holds (DD2) and re-introduces the pending_acknowledgment gate §9.5 forbids (the signed hire ` +
        `contract authorizes deductions; there is no driver e-sign).`,
    );
  }
  // The disclosure must survive: pending_ack keeps its own subtotal.
  if (!/pendingAckTotal = deductions\.reduce/.test(src)) {
    problems.push(`${PAGE}: pendingAckTotal must remain — pending_ack is a disclosure, not a deletion`);
  }
  return problems;
}

const files = Object.fromEntries([PAGE].map((r) => [r, readFileSync(path.join(ROOT, r), "utf8")]));

if (SELFTEST) {
  const checks = [];
  const reverted = {
    ...files,
    [PAGE]: files[PAGE].replace(
      "const deductionTotal = deductions.reduce((sum, row) => sum + row.this_period_amount, 0);",
      "const deductionTotal = deductions.reduce((sum, row) => sum + (row.pending_ack ? 0 : row.this_period_amount), 0);",
    ),
  };
  checks.push(["pending_ack zeroed again", assert(reverted).some((p) => /must NOT zero out/.test(p))]);
  const noDisclosure = { ...files, [PAGE]: files[PAGE].replace(/const pendingAckTotal = deductions\.reduce/, "const unusedTotal = deductions.reduce") };
  checks.push(["disclosure removed", assert(noDisclosure).some((p) => /must remain/.test(p))]);
  const failed = checks.filter(([, c]) => !c).map(([n]) => n);
  if (failed.length) { console.error(`${LABEL} SELFTEST FAIL — not caught: ${failed.join(", ")}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST PASS — ${checks.length}/${checks.length} planted regressions caught`);
  process.exit(0);
}

const problems = assert(files);
if (problems.length) { console.error(`${LABEL} FAIL:`); for (const p of problems) console.error("  - " + p); process.exit(1); }
console.log(`${LABEL}: OK — every deduction counts; pending_ack remains a disclosure`);
process.exit(0);
