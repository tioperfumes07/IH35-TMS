export default {
  name: "verify-bank-link-01-counterparty-fk",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bank-link-01-counterparty-fk.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-bank-link-01-counterparty-fk.mjs"]);
  },
};
