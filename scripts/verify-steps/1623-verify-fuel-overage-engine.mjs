// 1623-verify-fuel-overage-engine — FUEL-03.
export default {
  name: "verify-fuel-overage-engine",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fuel-overage-engine.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-fuel-overage-engine.mjs"]);
  },
};
