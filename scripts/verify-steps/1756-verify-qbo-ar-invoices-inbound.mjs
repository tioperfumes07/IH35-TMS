export default {
  name: "verify-qbo-ar-invoices-inbound",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-qbo-ar-invoices-inbound.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-qbo-ar-invoices-inbound.mjs"]);
  },
};
