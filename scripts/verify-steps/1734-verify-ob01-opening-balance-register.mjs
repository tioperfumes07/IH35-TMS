// Step 1734 — OB-01: the opening-balance register matches the 2026-07-29 owner ruling.
// Owner ruling: NO finality gate — balances are live and change. The register auto-imports +
// auto-commits the clone-as-is snapshot (Adjustment 0) and keeps a three-column worksheet model
// (QBO Snapshot | editable Adjustment | Adjusted Opening). Committing writes catalogs.accounts for a
// whole entity and is not reversible from the screen, so the remaining data-integrity refusals
// (maker == checker / unbalanced / OBE not reclassed) must still return BEFORE any write, the WORM
// audit + FORCE-RLS tables must stay intact, and `source_not_final` must never reappear anywhere.
export default {
  name: "verify:ob01-opening-balance-register",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-ob01-opening-balance-register.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-ob01-opening-balance-register.mjs"]);
  },
};
