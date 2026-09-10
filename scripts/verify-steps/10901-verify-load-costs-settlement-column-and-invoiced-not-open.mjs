export default {
  name: "verify-load-costs-settlement-column-and-invoiced-not-open",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-load-costs-settlement-column-and-invoiced-not-open.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-load-costs-settlement-column-and-invoiced-not-open.mjs"]);
    await ctx.run("node", ["scripts/verify-reg040-resettlement.mjs"]);
  },
};
