export default {
  name: "verify-bank-surf-01-dod",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bank-surf-01-dod.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-bank-surf-01-dod.mjs"]);
  },
};
