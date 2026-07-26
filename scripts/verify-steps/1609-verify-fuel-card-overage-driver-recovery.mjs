// 1609-verify-fuel-card-overage-driver-recovery — BANK-DOM-06.
//
// A fleet-card purchase over the owner's authorized limit — or a non-fuel item bought on the card —
// was paid in full by the company with NO recovery path: `overage` existed nowhere in the codebase,
// so every over-limit and personal charge was silently absorbed instead of being recovered from the
// driver's settlement.
//
// The guard enforces the fix as a RULE, not a patch: BOTH canonical fuel writers (CSV import route +
// Relay ingest cron) must flush the overage path after commit; the recovery must be gated on
// FUEL_CARD_OVERAGE_RECOVERY_ENABLED via isEnabled(...); it must REUSE createSettlementDeduction and
// write ZERO GL (no journal entry, no posting batch, no debit/credit line — money math stays in the
// FIN-18 settlement poster); deduction_type 'fuel' must alias to the REGISTERED
// fuel_advance_recovery role in BOTH settlement math modules (the naive `${type}_recovery`
// derivation yields 'fuel_recovery', which is registered nowhere and makes FIN-18 fail closed on
// every fuel deduction); and the migration must seed the flag DEFAULT OFF and ship both the
// idempotency UNIQUE index and both directions of the fuel-txn <-> deduction link.
//
// Run against pre-fix origin/main this FAILS (the service, math, migration and alias do not exist).
// The --selftest runs FIRST and is proven CAPABLE OF FAILING: it mutates the REAL source into 15
// distinct defect shapes, asserts each is caught, asserts no mutation was inert, asserts the shipped
// source is clean, and checks two benign shapes are NOT flagged.
export default {
  name: "verify-fuel-card-overage-driver-recovery",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fuel-card-overage-driver-recovery.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-fuel-card-overage-driver-recovery.mjs"]);
  },
};
