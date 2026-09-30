/**
 * ROUND 300 B-32 (Lead order): measured the Dreamline/Relay diesel card GL balances and their
 * (lack of) sub-ledger traceability. This ratchets that measurement so it can't silently get
 * worse. Verify-step 11967, CC-2 band (mod-4 ≡3).
 */
export default {
  name: "verify-fuel-card-gl-subledger-traceability",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fuel-card-gl-subledger-traceability.mjs"]);
  },
};
