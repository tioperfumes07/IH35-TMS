#!/usr/bin/env node
// BANKREC-CONFIRM-01 static guard — locks the Confirm-match button in MatchDrawer to EXACT
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

const failures = [];

if (!fs.existsSync(drawerPath)) {
  failures.push("missing apps/frontend/src/pages/banking/components/MatchDrawer.tsx");
} else {
  const src = fs.readFileSync(drawerPath, "utf8");

  if (!/const isBill = c\.ledger_entry_kind === ["']bill["'];/.test(src)) {
    failures.push("MatchDrawer.tsx: could not find the isBill===\"bill\" gate — bill exclusion may have regressed");
  }
  if (!/const isExactMatch = c\.amount_gap_cents === 0;/.test(src)) {
    failures.push("MatchDrawer.tsx: could not find isExactMatch = amount_gap_cents === 0 — exact-match gate may have regressed");
  }
  if (!/const canConfirm = !isBill && isExactMatch;/.test(src)) {
    failures.push("MatchDrawer.tsx: canConfirm must require BOTH !isBill AND isExactMatch");
  }

  // The rendered Confirm button's disabled prop must reference canConfirm — not a bare
  // `disabled` (hardcoded off) and not a bare `disabled={false}` / no disabled prop at all
  // (hardcoded on, which would let bill/variance matches post).
  const buttonMatch = src.match(/data-testid="match-candidate-confirm"[\s\S]*?\/>|data-testid="match-candidate-confirm"[\s\S]*?<\/button>/);
  if (!buttonMatch) {
    failures.push("MatchDrawer.tsx: could not find the match-candidate-confirm button");
  } else {
    const buttonSrc = buttonMatch[0];
    if (!/disabled=\{!canConfirm/.test(buttonSrc)) {
      failures.push("MatchDrawer.tsx: Confirm button's disabled prop must be driven by `!canConfirm` (never hardcoded)");
    }
    if (!/onClick=\{canConfirm \? /.test(buttonSrc)) {
      failures.push("MatchDrawer.tsx: Confirm button's onClick must be gated behind `canConfirm ? ... : undefined`");
    }
  }

  if (!/Posting available after CHAIN-04/.test(src)) {
    failures.push("MatchDrawer.tsx: bill-held note (\"Posting available after CHAIN-04\") is missing");
  }
  if (!/Variance posting pending balanced-JE proof \(Tier-1\)/.test(src)) {
    failures.push("MatchDrawer.tsx: variance-held note (\"Variance posting pending balanced-JE proof (Tier-1)\") is missing");
  }
  if (!/acceptBankReconMatch\(/.test(src)) {
    failures.push("MatchDrawer.tsx: Confirm must call acceptBankReconMatch");
  }
  if (!/import\s*\{[^}]*acceptBankReconMatch[^}]*\}\s*from\s*["']\.\.\/\.\.\/\.\.\/api\/banking["']/.test(src)) {
    failures.push("MatchDrawer.tsx: acceptBankReconMatch must be imported from ../../../api/banking");
  }
}

if (failures.length > 0) {
  console.error("verify:bankrec-confirm-exact-only — FAILED");
  for (const m of failures) console.error(`- ${m}`);
  process.exit(1);
}
console.log("verify:bankrec-confirm-exact-only — OK");
