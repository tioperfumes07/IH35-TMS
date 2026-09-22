/**
 * E8 (P1, Lead ruling Round 53/56-A LANE-CROSS GRANTED) — wires
 * scripts/verify-bank-line-status-has-live-target.mjs (the shrink-only ratchet on bank lines whose
 * status claims a live matched journal entry that the five-column liveness check proves is dead)
 * into CI. Verify-step 11551, CC-2's ≡3 mod 4 band.
 */
export default {
  name: "verify-bank-line-status-has-live-target",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bank-line-status-has-live-target.mjs"]);
  },
};
