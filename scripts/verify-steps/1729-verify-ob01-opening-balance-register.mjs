// Step 1729 — OB-01: the opening-balance commit stays data-gated on source finality.
// Committing writes catalogs.accounts for a whole entity and is not reversible from the screen. The
// refusal (source not final / maker == checker / unbalanced / OBE not reclassed) must throw BEFORE
// any write, and the WORM audit + FORCE-RLS tables must stay intact.
export default {
  name: "verify:ob01-opening-balance-register",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-ob01-opening-balance-register.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-ob01-opening-balance-register.mjs"]);
  },
};
