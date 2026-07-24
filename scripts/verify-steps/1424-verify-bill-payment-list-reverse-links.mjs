export default {
  name: "verify-bill-payment-list-reverse-links",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bill-payment-list-reverse-links.mjs"]);
    await ctx.run("node", ["scripts/verify-bill-payment-list-reverse-links.mjs", "--selftest"]);
  },
};
