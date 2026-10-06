#!/usr/bin/env node
// BANKREC-CONFIRM-01 static guard (updated to ROUND 206, see evaluate()) — locks the Confirm-match button in MatchDrawer:
// matches only, so it can't regress into posting a variance JE or persisting a bill accept without
// the follow-on financial proof (CLAUDE.md §2: every bug fix / gated feature gets a static CI guard).
//
// Invariants:
//   (1) MatchDrawer computes `canConfirm = !isBill && isExactMatch` (or equivalent) — Confirm must
//       stay gated on BOTH "not a bill" and "amount_gap_cents === 0".
//   (2) The button's `disabled` prop must reference `canConfirm` (or `isBill`/`isExactMatch`
//       directly) — never a bare `disabled` (hardcoded-always-off) and never a bare `false`
//       (always-on, which would let a bill or a variance match post through unconditionally).
//   (3) The bill-held note ("Posting available after CHAIN-04") and the variance-held note
//       ("Variance posting pending balanced-JE proof (Tier-1)") must both still be present.
//   (4) The confirm onClick must call acceptBankReconMatch (the accept-match client), and that
//       call site must be gated behind `canConfirm` (not fired unconditionally).
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const drawerPath = path.join(repoRoot, "apps/frontend/src/pages/banking/components/MatchDrawer.tsx");

// ROUND 206 (owner asked 4x) superseded BANKREC-CONFIRM-01's "exact only, variance held": a VARIANCE match may be
// confirmed once a write-off / difference account is selected, because acceptMatchWithResolveDifference posts the
// balanced variance JE. What did NOT change, and is enforced here: a BILL is never confirmable (CHAIN-04 Part 2b);
// an exact match links and clears; a variance needs the write-off account; the button is driven by canConfirm only.
export function evaluate(src) {
  const failures = [];
  if (!/const isBill = c\.ledger_entry_kind === ["']bill["'];/.test(src)) failures.push("MatchDrawer.tsx: the isBill===\"bill\" gate is missing — bill exclusion may have regressed");
  if (!/const isExactMatch = c\.amount_gap_cents === 0;/.test(src)) failures.push("MatchDrawer.tsx: isExactMatch = amount_gap_cents === 0 is missing — exact-match gate may have regressed");
  if (!/const canConfirmVariance = !isBill && !isExactMatch && Boolean\(effectiveWriteOffId\);/.test(src)) failures.push("MatchDrawer.tsx: a variance Confirm must require !isBill AND a selected write-off account (canConfirmVariance)");
  if (!/const canConfirm = !isBill && \(isExactMatch \|\| canConfirmVariance\);/.test(src)) failures.push("MatchDrawer.tsx: canConfirm must be !isBill && (isExactMatch || canConfirmVariance)");
  const buttonMatch = src.match(/data-testid="match-candidate-confirm"[\s\S]*?\/>|data-testid="match-candidate-confirm"[\s\S]*?<\/button>/);
  if (!buttonMatch) failures.push("MatchDrawer.tsx: could not find the match-candidate-confirm button");
  else {
    if (!/disabled=\{!canConfirm/.test(buttonMatch[0])) failures.push("MatchDrawer.tsx: Confirm button's disabled prop must be driven by `!canConfirm` (never hardcoded)");
    if (!/onClick=\{canConfirm \? /.test(buttonMatch[0])) failures.push("MatchDrawer.tsx: Confirm button's onClick must be gated behind `canConfirm ? ... : undefined`");
  }
  if (!/Posting available after CHAIN-04/.test(src)) failures.push("MatchDrawer.tsx: bill-held note (\"Posting available after CHAIN-04\") is missing");
  if (!/VARIANCE_NEEDS_WRITEOFF/.test(src)) failures.push("MatchDrawer.tsx: the variance write-off requirement message (VARIANCE_NEEDS_WRITEOFF) is missing");
  if (!/acceptMatchWithResolveDifference/.test(src)) failures.push("MatchDrawer.tsx: a variance must post through acceptMatchWithResolveDifference (the balanced variance JE)");
  if (!/acceptBankReconMatch\(/.test(src)) failures.push("MatchDrawer.tsx: Confirm must call acceptBankReconMatch");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const src = fs.readFileSync(drawerPath, "utf8");
  const cases = [
    ["current MatchDrawer passes", evaluate(src).length === 0],
    ["a bill made confirmable fails", evaluate(src.replace("const canConfirm = !isBill && (isExactMatch || canConfirmVariance);", "const canConfirm = isExactMatch || canConfirmVariance;")).length > 0],
    ["a variance confirmable WITHOUT a write-off account fails", evaluate(src.replace("const canConfirmVariance = !isBill && !isExactMatch && Boolean(effectiveWriteOffId);", "const canConfirmVariance = !isBill && !isExactMatch;")).length > 0],
    ["a hardcoded-enabled button fails", evaluate(src.replace("disabled={!canConfirm", "disabled={false")).length > 0],
    ["dropping the bill-held note fails", evaluate(src.replace("Posting available after CHAIN-04", "")).length > 0],
  ];
  for (const [n, ok] of cases) console.log(`  ${ok ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, ok]) => !ok).length;
  console.log(bad ? "verify:bankrec-confirm-exact-only --selftest FAIL" : `verify:bankrec-confirm-exact-only --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const failures = fs.existsSync(drawerPath) ? evaluate(fs.readFileSync(drawerPath, "utf8")) : ["missing apps/frontend/src/pages/banking/components/MatchDrawer.tsx"];
if (failures.length > 0) {
  console.error("verify:bankrec-confirm-exact-only — FAILED");
  for (const m of failures) console.error(`- ${m}`);
  process.exit(1);
}
console.log("verify:bankrec-confirm-exact-only — OK");
