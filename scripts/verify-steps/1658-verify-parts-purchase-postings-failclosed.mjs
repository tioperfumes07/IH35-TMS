export default {
  name: "verify-parts-purchase-postings-failclosed",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-parts-purchase-postings-failclosed.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-parts-purchase-postings-failclosed.mjs"]);
  },
};
