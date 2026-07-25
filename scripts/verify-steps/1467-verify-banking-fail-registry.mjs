export default {
  name: "verify-banking-fail-registry",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-banking-fail-registry.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-banking-fail-registry.mjs"]);
  },
};
