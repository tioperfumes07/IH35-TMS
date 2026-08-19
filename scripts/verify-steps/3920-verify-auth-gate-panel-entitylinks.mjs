export default {
  name: "verify-auth-gate-panel-entitylinks",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-auth-gate-panel-entitylinks.mjs"]);
  },
};
