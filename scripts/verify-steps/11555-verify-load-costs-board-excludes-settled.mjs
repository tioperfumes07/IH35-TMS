/**
 * E11-D3 (P2, Lead ruling Round 53/56-A LANE-CROSS GRANTED) — wires
 * scripts/verify-load-costs-board-excludes-settled.mjs (zero-tolerance check that no settled-class
 * load carrying real, non-void cost leaks into the Load-Costs board's live active-load set) into
 * CI. Verify-step 11555, CC-2's ≡3 mod 4 band.
 */
export default {
  name: "verify-load-costs-board-excludes-settled",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-load-costs-board-excludes-settled.mjs"]);
  },
};
