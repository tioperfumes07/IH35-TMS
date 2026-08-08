export default {
  name: "verify-customer-create-invoice-email",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-customer-create-invoice-email.mjs"]);
  },
};
