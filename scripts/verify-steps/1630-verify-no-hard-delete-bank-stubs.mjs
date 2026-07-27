/** F9-01 — never hard-DELETE banking.bank_transactions on stub merge. */
export default {
  name: "verify-no-hard-delete-bank-stubs",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-hard-delete-bank-stubs.mjs"]);
    await ctx.run("node", ["scripts/verify-no-hard-delete-bank-stubs.mjs", "--selftest"]);
  },
};
