#!/usr/bin/env node
/**
 * settlements "liability" COLUMN, forward direction — VERTICAL-WIRING-LAW-2026-08-12.
 *
 * @matrix-built {"modules":["settlements"],"cols":["liability"],"leafRe":"^(settlements\\.list|settlements\\.detail|settlement_close|pre_settlements)$","task":"WAVE-C-liability-settlements-forward","vertical":"column-wave"}
 *
 * Earlier this session's liability column-wave audit (PR #6158) found the REVERSE direction
 * (liability → the settlement(s) that repaid it) already wired via
 * LiabilityDetailDrawer.tsx's "Settlement History" section, but explicitly documented the FORWARD
 * direction (a settlement's own deduction breakdown → the liability record each line is paying
 * down) as unwired, with zero EntityLink anywhere in LiabilityBreakdownModal.tsx. Fixed here: the
 * "Type" column renders a real EntityLink when the row's id is a genuine liability UUID (the
 * source payload, debt.debt.source_liabilities, already carries real per-liability ids — the id
 * only falls back to an array index for a row with no matched liability, which is correctly left
 * unlinked, not fabricated).
 *
 * DeductionsSection.tsx (a different, more mechanical settlement-line listing) was NOT touched —
 * its underlying data (driver_finance.settlement_lines) has no liability_id column anywhere in its
 * chain (confirmed in the earlier audit), so it cannot resolve a real link without a new schema
 * column — same class of gap as factoring's batches.create, out of scope for a reverse-JOIN fix.
 *
 * Self-test: node scripts/verify-settlements-liability-forward-link.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlements-liability-forward-link";
const FILE = "apps/frontend/src/pages/driver-finance/components/LiabilityBreakdownModal.tsx";
const PATTERN = /UUID_RE\.test\(item\.id\) \? <EntityLink kind="liability"/;

export function check(src) {
  return PATTERN.test(src);
}

if (process.argv.includes("--selftest")) {
  const good = 'render: (item) => (UUID_RE.test(item.id) ? <EntityLink kind="liability" id={item.id} label={item.type} /> : item.type),';
  if (!check(good)) {
    console.error(`[${LABEL}] selftest FAIL: known-good fixture should pass`);
    process.exit(1);
  }
  const regressed = 'render: (item) => item.type,';
  if (check(regressed)) {
    console.error(`[${LABEL}] selftest FAIL: regressed fixture (plain text) should fail`);
    process.exit(1);
  }
  console.log(`[${LABEL}] selftest: PASS — good/regressed fixtures classify correctly`);
  process.exit(0);
}

const p = path.join(ROOT, FILE);
if (!fs.existsSync(p)) {
  console.error(`[${LABEL}] FAIL: ${FILE} not found`);
  process.exit(1);
}
const src = fs.readFileSync(p, "utf8");
if (!check(src)) {
  console.error(`[${LABEL}] FAIL: ${FILE} no longer renders the liability EntityLink`);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — LiabilityBreakdownModal renders the forward settlement→liability link`);
