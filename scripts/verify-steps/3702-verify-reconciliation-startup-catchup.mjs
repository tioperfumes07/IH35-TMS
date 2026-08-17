export default {
  name: "verify-reconciliation-startup-catchup",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reconciliation-startup-catchup.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-reconciliation-startup-catchup.mjs"]);
  },
};
