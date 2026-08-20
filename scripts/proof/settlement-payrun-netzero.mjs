#!/usr/bin/env node
// SETTLEMENT PAY-RUN NET-ZERO PROOF (standalone, zero-dep). Replicates the EXACT arithmetic of
// apps/backend/src/driver-finance/{escrow-resolver,settlement-payrun-close}.service.ts and asserts the
// pay-run journal entry balances to the cent. Pure integer-cent math — no DB, no npm install.
//
//   NET     = gross − deductions − escrow_contribution − advance_recoveries − chargebacks
//   escrow  = min(standard, max(0, ESCROW_CAP_CENTS − escrow_balance_before))   [ESCROW_CAP_CENTS = 250000]
//   legs    : Dr driver_pay(gross) ; Cr deduction ; Cr chargeback ; Cr advance ; Cr escrow ; Cr cash(net)
//   assert  : SUM(debits) === SUM(credits)  (or throw).
//
// The DB-level proof (maker<>checker CHECK, new settlement_lines line_types, payrun_gl_runs idempotency
// anchor) lives beside this in scripts/proof/settlement-payrun-netzero.sql (run via `sudo -u postgres psql`).
// Run: node scripts/proof/settlement-payrun-netzero.mjs

// ACCT-F5657 — was 200_000 (superseded). Owner ruling C2b (2026-07-26, "IT IS 2500 NOW") raised the
// cap to $2,500; this standalone proof script's own literal never got updated, so it was attesting
// net-zero against the WRONG cap value even though the real backend (escrow-resolver.service.ts's
// ESCROW_CAP_CENTS) and its own guard (verify-settlement-escrow-cap.mjs) were both already correct.
const ESCROW_CAP_CENTS = 250_000; // I3 LOCKED — matches escrow-resolver.service.ts ESCROW_CAP_CENTS

/** min(standard, max(0, cap − balance)) — replica of computeCappedEscrowContributionCents. */
function cappedEscrow(currentBalanceCents, standardCents) {
  const current = Math.max(0, Math.round(currentBalanceCents || 0));
  const standard = Math.max(0, Math.round(standardCents || 0));
  const headroom = Math.max(0, ESCROW_CAP_CENTS - current);
  return Math.min(standard, headroom);
}

/** Build the balanced pay-run legs + assert debits==credits (replica of closeSettlementPayRun). */
function payRunLegs({ gross, deductions, chargebacks, advance, escrowBalanceBefore, standardEscrow }) {
  const escrow = cappedEscrow(escrowBalanceBefore, standardEscrow);
  const net = gross - deductions - escrow - advance - chargebacks;
  if (net < 0) throw new Error(`NET_PAY_NEGATIVE (${net}c)`);
  const legs = [
    { dc: "debit", cents: gross, memo: "driver pay (gross)" },
    { dc: "credit", cents: deductions, memo: "deduction recovery" },
    { dc: "credit", cents: chargebacks, memo: "abandonment chargeback recovery" },
    { dc: "credit", cents: advance, memo: "cash-advance recovery" },
    { dc: "credit", cents: escrow, memo: "escrow contribution (capped @ $2,500)" },
    { dc: "credit", cents: net, memo: "net driver pay via payment method" },
  ].filter((l) => l.cents > 0);
  const debit = legs.filter((l) => l.dc === "debit").reduce((s, l) => s + l.cents, 0);
  const credit = legs.filter((l) => l.dc === "credit").reduce((s, l) => s + l.cents, 0);
  if (debit !== credit || debit <= 0) throw new Error(`UNBALANCED debits=${debit} credits=${credit}`);
  return { escrow, net, debit, credit, legs };
}

let fail = 0;
function check(label, cond) {
  console.log(`${cond ? "ok  " : "FAIL"} ${label}`);
  if (!cond) fail += 1;
}

console.log("── CASE 1: escrow BELOW cap — JE balances to the cent ──");
const c1 = payRunLegs({ gross: 300000, deductions: 40000, chargebacks: 10000, advance: 20000, escrowBalanceBefore: 50000, standardEscrow: 25000 });
console.table(c1.legs);
console.log(`  escrow_contribution=${c1.escrow}  net=${c1.net}  debits=${c1.debit}  credits=${c1.credit}`);
check("CASE1 escrow_contribution == 25000", c1.escrow === 25000);
check("CASE1 net == 205000", c1.net === 205000);
check("CASE1 debits == credits (300000)", c1.debit === c1.credit && c1.debit === 300000);

console.log("\n── CASE 2: escrow AT / OVER the $2,500 cap — contribution == 0 ──");
check("CASE2 @cap(250000) contribution == 0", cappedEscrow(250000, 25000) === 0);
check("CASE2 @over(300000) contribution == 0", cappedEscrow(300000, 25000) === 0);
const c2 = payRunLegs({ gross: 300000, deductions: 40000, chargebacks: 10000, advance: 20000, escrowBalanceBefore: 250000, standardEscrow: 25000 });
check("CASE2 at-cap JE still balances", c2.debit === c2.credit);

console.log("\n── CASE 3: partial-headroom cap — contribution clamps to remaining room ──");
check("CASE3 bal=240000 std=25000 -> contribution == 10000", cappedEscrow(240000, 25000) === 10000);
const c3 = payRunLegs({ gross: 300000, deductions: 40000, chargebacks: 10000, advance: 20000, escrowBalanceBefore: 240000, standardEscrow: 25000 });
check("CASE3 clamped JE balances", c3.debit === c3.credit && c3.escrow === 10000);

console.log(`\nsettlement-payrun-netzero ${fail === 0 ? "PASS" : "FAIL"} (${fail} failing check(s))`);
process.exit(fail === 0 ? 0 : 1);
