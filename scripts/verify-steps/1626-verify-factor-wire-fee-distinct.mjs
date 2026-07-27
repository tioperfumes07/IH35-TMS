export default {
  name: "verify-factor-wire-fee-distinct",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-factor-wire-fee-distinct.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-factor-wire-fee-distinct.mjs"]);
  },
};
