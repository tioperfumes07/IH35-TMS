// Step 1736 — OB-01: the clone-as-is fixture re-sums to the owner's acceptance totals.
// Independent of step 1734's lighter existence check: re-derives Assets/Liabilities/Equity directly
// from the fixture's own lines and proves both the re-sum AND the declared acceptance_totals_cents
// object agree with the owner's numbers (Cursor-OpeningBalances-OB01.md), and that A = L + E.
export default {
  name: "verify:ob01-fixture-tieout",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-ob01-fixture-tieout.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-ob01-fixture-tieout.mjs"]);
  },
};
