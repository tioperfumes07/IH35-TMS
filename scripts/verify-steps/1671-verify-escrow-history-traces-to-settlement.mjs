/** SAF-B22 — an escrow balance that cannot be traced to the settlement that moved it is not auditable. */
export default {
  name: "verify-escrow-history-traces-to-settlement",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-escrow-history-traces-to-settlement.mjs"]);
    await ctx.run("node", ["scripts/verify-escrow-history-traces-to-settlement.mjs", "--selftest"]);
  },
};
