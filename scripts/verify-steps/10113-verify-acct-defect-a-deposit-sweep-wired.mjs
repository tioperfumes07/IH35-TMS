/** GO-CLOSE-188 CC-1 DEFECT A -- customer_payment_deposit sweep posts the missing cash debit. */
export default {
  name: "verify-acct-defect-a-deposit-sweep-wired",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-defect-a-deposit-sweep-wired.mjs"]);
    await ctx.run("node", ["scripts/verify-acct-defect-a-deposit-sweep-wired.mjs", "--selftest"]);
  },
};
