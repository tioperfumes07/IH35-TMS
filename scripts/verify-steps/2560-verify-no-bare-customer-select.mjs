// CLS-CUST-BARE-SELECT — systemic: no listCustomers + plain <select> for customer FKs.
export default {
  name: "verify:no-bare-customer-select",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-bare-customer-select.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-no-bare-customer-select.mjs"]);
  },
};
