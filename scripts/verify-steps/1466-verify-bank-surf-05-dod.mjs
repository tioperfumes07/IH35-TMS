export default {
  name: "verify-bank-surf-05-dod",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bank-surf-05-dod.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-bank-surf-05-dod.mjs"]);
  },
};
