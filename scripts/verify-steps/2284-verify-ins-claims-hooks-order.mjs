export default {
  name: "verify-ins-claims-hooks-order",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-ins-claims-hooks-order.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-ins-claims-hooks-order.mjs"]);
  },
};
