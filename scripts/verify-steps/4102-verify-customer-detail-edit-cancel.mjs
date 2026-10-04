export default {
  name: "verify-customer-detail-edit-cancel",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-customer-detail-edit-cancel.mjs"]);
    // BANK-F91485 — WOStatusPieChart leftover muted refuse (1495 is ODD; leftover now on this EVEN host).
    await ctx.run("node", ["scripts/verify-0280-42-wo-to-expense-flow.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-0280-42-wo-to-expense-flow.mjs"]);
  },
};
