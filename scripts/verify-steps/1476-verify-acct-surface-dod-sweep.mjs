export default {
  name: "verify-acct-surface-dod-sweep",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-surface-dod-sweep.mjs"]);
  },
};
