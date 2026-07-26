export default {
  name: "verify-bank-dom-05-intercompany-reciprocal-legs",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bank-dom-05-intercompany-reciprocal-legs.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-bank-dom-05-intercompany-reciprocal-legs.mjs"]);
  },
};
