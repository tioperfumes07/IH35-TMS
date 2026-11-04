#!/usr/bin/env node
/**
 * verify-rows-89-90-112 — register rows 89 (A/R vs Faro purchases), 90 (1090 Undeposited holds Faro advances) and
 * 112 / ENG-17 (1090 + 2510 residuals tied document by document). ACCT-F11071.
 *
 * LOCKED RULE (claude/00-CANONICAL-FACTORING-POSTING-LOCKED.md, ih35-accounting-decisions §3): factoring = secured
 * borrowing. A Faro PURCHASE debits 1090 Undeposited (net wire due) + 1230 reserve + 6400 fee (+ 6300 wire fee) and
 * credits 2150 Factoring Advance — it NEVER relieves A/R. The WIRE moves 1090 → bank. A/R is relieved only when the
 * customer pays Faro (Dr 2150 / Cr A/R).
 *
 * Measured on prod br-fancy-credit-akjnd07a 2026-11-03 (USMCA): 57 advanced invoices open = $175,650.00 = face of the
 * 17 posted purchases; 0 customer payments / 0 collections (row 89 "0 applied" is correct by rule). 1090 funding legs
 * = $170,210.48 (17 live + 8 voided-and-reversed advances); 3 sweeps −$10,446.00 → live $159,764.48 = 14 purchases
 * whose same-day Faro wire was never matched (10 exact to the cent, 3 short wires, 1 no wire in window).
 *
 * ROW 90 LAW (engines that move 1090 → bank):
 *   1. the Faro wire proposal engine anchors its wire window on each PURCHASE date (± DAY_WINDOW), never on as_of —
 *      the as_of ± 74-day window hid the 08-17 / 08-18 / 08-19 wires when run on 11-03 (7 NO_EVIDENCE → 10 PROPOSED);
 *   2. PROPOSED only for ONE exact wire with nothing beside it and no other purchase claiming it; a short wire is
 *      evidence for the owner (AMBIGUOUS), never a proposal;
 *   3. the deposit sweep finds its bank through a LIVE match only (auto/user matched, not voided) — a 'released'
 *      match from an Undo must not decide which bank register 1090 sweeps into;
 *   4. Undo reverses only ORIGINAL sweeps — never the reversal an earlier Undo posted (match → Undo → re-match →
 *      Undo failed with void_reversal_je_is_itself_a_reversal).
 * ROW 89 LAW (one A/R relief per factored invoice):
 *   5. the reserve_held (customer-paid-Faro) poster is refused once a Faro collection payment was applied to the
 *      advance's invoices — the poster's outstanding check cannot see a payment-sourced 2150 leg;
 *   6. collection-apply relieves A/R against 2150 (factoring_advance_liability), never against cash/bank;
 *   7. the purchase writer never names ar_control.
 *
 * Usage: node scripts/verify-rows-89-90-112.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-rows-89-90-112";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const FILES = {
  proposal: "apps/backend/src/factoring/faro-1090-wire-proposal.service.ts",
  postingEngine: "apps/backend/src/accounting/posting-engine.service.ts",
  stateMachine: "apps/backend/src/banking/bank-line-state-machine.service.ts",
  advancesRoutes: "apps/backend/src/accounting/factoring-advances.routes.ts",
  collectionApply: "apps/backend/src/factoring/collection-apply.service.ts",
  purchase: "apps/backend/src/factoring/purchase.service.ts",
};

function slice(src, startMarker, len) {
  const at = src.indexOf(startMarker);
  return at >= 0 ? src.slice(at, at + len) : "";
}

// ---- pure checks -------------------------------------------------------------------------------------------

export function checkRow90({ proposal, postingEngine, stateMachine }) {
  const problems = [];
  // 1. wire window per purchase date
  if (!/export function wireWindowForPurchases\(/.test(proposal)) problems.push("proposal engine lost wireWindowForPurchases (per-purchase wire window)");
  if (!/const window = wireWindowForPurchases\(purchaseRows\)/.test(proposal)) problems.push("listFaro1090WireProposals does not build its wire window from the purchases");
  if (!/\[operatingCompanyId, window\.from, window\.to\]/.test(proposal)) problems.push("wire query is not bound to the purchase window (window.from / window.to)");
  if (/\$2::date\s*-\s*\(\$3::int/.test(proposal)) problems.push("wire query is anchored on as_of again ($2::date - ($3::int ...)) — wires older than as_of − N vanish");
  if (/LIMIT 2000/.test(proposal)) problems.push("wire query truncates at LIMIT 2000 — a truncated read is a false NO_EVIDENCE");
  // 2. PROPOSED rule + short wires
  const classify = slice(proposal, "function classify(", 700);
  if (!/exact\.length === 1 && candidates\.length === 1 && !claimedByAnotherPurchase\) return "PROPOSED"/.test(classify)) {
    problems.push("classify(): PROPOSED must require one exact candidate, nothing beside it, and no other purchase claiming the wire");
  }
  if ((classify.match(/return "PROPOSED"/g) ?? []).length !== 1) problems.push("classify(): a second PROPOSED return exists (lone near/short candidate proposed)");
  const shortAt = proposal.indexOf("short_wire: true");
  if (shortAt < 0 || !/exact_amount: false,\s*short_wire: true/.test(proposal)) problems.push("short wires must be exact_amount:false + short_wire:true (never PROPOSED)");
  // 3. sweep finds its bank by a LIVE match
  const sweep = slice(postingEngine, "async function buildFactoringAdvanceDepositSweepLines(", 6000);
  if (!sweep) problems.push("posting-engine: buildFactoringAdvanceDepositSweepLines not found");
  if (/match_state\s*<>\s*'rejected'/.test(sweep)) problems.push("deposit sweep counts a released/voided match as the covering bank line (match_state <> 'rejected')");
  if (!/rm\.voided_at IS NULL\s*AND rm\.match_state IN \('auto_matched', 'user_matched'\)/.test(sweep)) {
    problems.push("deposit sweep must require rm.voided_at IS NULL AND rm.match_state IN ('auto_matched', 'user_matched')");
  }
  // 4. Undo reverses only original sweeps
  const undo = slice(stateMachine, "async function reverseMatchCreatedEntries(", 2500);
  if (!/AND je\.reverses_je_id IS NULL\s*AND \(\(p\.source_transaction_type = 'customer_payment_deposit'/.test(undo)) {
    problems.push("Undo's deposit-sweep collector must skip reversal entries (je.reverses_je_id IS NULL)");
  }
  return problems;
}

export function checkRow89({ advancesRoutes, collectionApply, purchase }) {
  const problems = [];
  const reserveHeld = slice(advancesRoutes, 'action: "reserve_held"', 6000);
  const guardAt = reserveHeld.indexOf("factoring_collection_already_applied");
  const postAt = reserveHeld.indexOf("postFactoringCustomerPaymentEvent(");
  if (guardAt < 0 || postAt < 0 || guardAt > postAt) {
    problems.push("reserve_held route must refuse (factoring_collection_already_applied) BEFORE postFactoringCustomerPaymentEvent");
  }
  if (!/p\.payment_source_kind = 'factoring_collection'/.test(reserveHeld) || !/pa\.unapplied_at IS NULL/.test(reserveHeld)) {
    problems.push("reserve_held prior-collection check must read live factoring_collection applications");
  }
  if (!/resolveRoleAccount\(\s*client as never,\s*oci,\s*"factoring_advance_liability"/.test(collectionApply) || !/deposited_to_account_id: liabilityAccountId/.test(collectionApply)) {
    problems.push("collection-apply must relieve A/R against factoring_advance_liability (2150)");
  }
  if (/ar_control/.test(purchase)) problems.push("factoring purchase writer names ar_control — a purchase never relieves A/R (secured borrowing)");
  return problems;
}

function liveInputs() {
  return Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
}

// ---- selftest ----------------------------------------------------------------------------------------------

if (process.argv.includes("--selftest")) {
  const live = liveInputs();
  const caught = (fn, mut, needle) => fn({ ...live, ...mut }).some((p) => p.includes(needle));
  const cases = [
    ["live tree: row 90 clean", checkRow90(live).length === 0],
    ["live tree: row 89 clean", checkRow89(live).length === 0],
    ["plant: as_of-anchored wire window is caught",
      caught(checkRow90, { proposal: live.proposal.replace("[operatingCompanyId, window.from, window.to]", "[operatingCompanyId, asOfDate, DAY_WINDOW + 60]") }, "window.from")],
    ["plant: LIMIT 2000 truncation is caught",
      caught(checkRow90, { proposal: live.proposal.replace("ORDER BY b.transaction_date, b.id", "ORDER BY b.transaction_date, b.id LIMIT 2000") }, "LIMIT 2000")],
    ["plant: lone non-exact PROPOSED is caught",
      caught(checkRow90, { proposal: live.proposal.replace('  return "AMBIGUOUS";\n}', '  if (candidates.length === 1) return "PROPOSED";\n  return "AMBIGUOUS";\n}') }, "second PROPOSED")],
    ["plant: claimed-by-another ignored is caught",
      caught(checkRow90, { proposal: live.proposal.replace(" && !claimedByAnotherPurchase) return", ") return") }, "no other purchase")],
    ["plant: short wire flagged exact is caught",
      caught(checkRow90, { proposal: live.proposal.replace("exact_amount: false,\n        short_wire: true", "exact_amount: true,\n        short_wire: true") }, "short wires")],
    ["plant: sweep back on <> 'rejected' is caught",
      caught(checkRow90, { postingEngine: live.postingEngine.replace("AND rm.voided_at IS NULL\n               AND rm.match_state IN ('auto_matched', 'user_matched')", "AND rm.match_state <> 'rejected'") }, "deposit sweep")],
    ["plant: Undo re-reverses reversals is caught",
      caught(checkRow90, { stateMachine: live.stateMachine.replace("        AND je.reverses_je_id IS NULL\n", "") }, "reversal entries")],
    ["plant: reserve_held without prior-collection refusal is caught",
      caught(checkRow89, { advancesRoutes: live.advancesRoutes.replace('error: "factoring_collection_already_applied"', 'error: "x"') }, "reserve_held route")],
    ["plant: collection-apply into the bank is caught",
      caught(checkRow89, { collectionApply: live.collectionApply.replace("deposited_to_account_id: liabilityAccountId", "deposited_to_account_id: bankAccountId") }, "2150")],
    ["plant: purchase writer touching ar_control is caught",
      caught(checkRow89, { purchase: `${live.purchase}\n// role("ar_control")` }, "never relieves A/R")],
  ];
  for (const [n, pass] of cases) console.log(`  ${pass ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, p]) => !p).length;
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

// ---- run ---------------------------------------------------------------------------------------------------

const live = liveInputs();
const problems = [...checkRow90(live).map((p) => `[90/112] ${p}`), ...checkRow89(live).map((p) => `[89] ${p}`)];
if (problems.length) {
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error(`${LABEL} FAIL (${problems.length})`);
  process.exit(1);
}
console.log(
  `${LABEL} PASS — 90/112: wire window per purchase date, PROPOSED = one exclusive exact wire, short wire never proposed, sweep bank by live match only, Undo skips reversals · 89: one A/R relief per factored invoice, collection relieves 2150, purchase never touches A/R`
);
