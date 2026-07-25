export default {
  name: "verify-bank-surface-dod-sweep",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bank-surface-dod-sweep.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-bank-surface-dod-sweep.mjs"]);
  },
};
