// CUST-buttons.ui — Customers Edit chrome parity with New transaction (Cascade wave).
export default {
  name: "verify-cust-buttons-ui",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cust-buttons-ui.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-cust-buttons-ui.mjs"]);
  },
};
