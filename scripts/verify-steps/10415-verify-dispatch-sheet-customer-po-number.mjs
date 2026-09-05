export default {
  name: "verify-dispatch-sheet-customer-po-number",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dispatch-sheet-customer-po-number.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-dispatch-sheet-customer-po-number.mjs"]);
  },
};
