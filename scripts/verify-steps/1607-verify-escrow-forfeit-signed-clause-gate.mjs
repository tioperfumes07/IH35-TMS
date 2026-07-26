export default {
  name: "verify-escrow-forfeit-signed-clause-gate",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-escrow-forfeit-signed-clause-gate.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-escrow-forfeit-signed-clause-gate.mjs"]);
  },
};
