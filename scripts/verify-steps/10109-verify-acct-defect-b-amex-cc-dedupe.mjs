/** GO-CLOSE-188 CC-1 DEFECT B -- USMCA Amex CC bank_accounts row no longer shares its cash GL account. */
export default {
  name: "verify-acct-defect-b-amex-cc-dedupe",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-defect-b-amex-cc-dedupe.mjs"]);
    await ctx.run("node", ["scripts/verify-acct-defect-b-amex-cc-dedupe.mjs", "--selftest"]);
  },
};
