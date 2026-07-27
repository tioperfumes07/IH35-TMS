/** INS-04 — damage_continuity_chains.insurance_claim_id FK to insurance.claim. */
export default {
  name: "verify-damage-chain-claim-fk",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-damage-chain-claim-fk.mjs"]);
    await ctx.run("node", ["scripts/verify-damage-chain-claim-fk.mjs", "--selftest"]);
  },
};
